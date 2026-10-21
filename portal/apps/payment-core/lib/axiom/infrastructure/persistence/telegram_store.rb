# frozen_string_literal: true
module Axiom
  class TelegramStore
    def initialize(db) = @db=db
    def sql = @db.connection
    def transaction(&block) = @db.transaction(&block)
    def link(customer_id) = sql.get_first_row('SELECT * FROM telegram_links WHERE customer_id=?',[customer_id])
    def actor(user_id,chat_id)
      sql.get_first_row('SELECT l.*,c.role,c.username FROM telegram_links l JOIN customers c ON c.id=l.customer_id WHERE l.user_id=? AND l.chat_id=? AND l.blocked=0',[user_id.to_s,chat_id.to_s])
    end
    def pending(customer_id) = sql.get_first_row('SELECT user_id,chat_id,display_name,expires_at FROM telegram_link_tokens WHERE customer_id=? AND expires_at>?',[customer_id,Axiom.now])
    def start(customer_id,hash)
      transaction do
        sql.execute('DELETE FROM telegram_link_tokens WHERE customer_id=? OR expires_at<=?',[customer_id,Axiom.now])
        sql.execute('INSERT INTO telegram_link_tokens(token_hash,customer_id,expires_at) VALUES(?,?,?)',[hash,customer_id,Axiom.now+300000])
      end
    end
    def claim(hash,user_id,chat_id,display)
      sql.get_first_row('UPDATE telegram_link_tokens SET user_id=?,chat_id=?,display_name=?,claimed_at=? WHERE token_hash=? AND expires_at>? AND claimed_at IS NULL RETURNING customer_id',[user_id,chat_id,display,Axiom.now,hash,Axiom.now])
    end
    def confirm(customer_id,user_id)
      transaction do
        row=sql.get_first_row('SELECT * FROM telegram_link_tokens WHERE customer_id=? AND user_id=? AND expires_at>? AND claimed_at IS NOT NULL',[customer_id,user_id,Axiom.now])
        raise Error.new(409,'Tautan belum diklaim atau identitas tidak sesuai.') unless row
        raise Error.new(409,'Putuskan tautan aktif sebelum menautkan ulang.') if link(customer_id)
        raise Error.new(409,'Identitas Telegram sudah terhubung ke akun lain.') if sql.get_first_value('SELECT 1 FROM telegram_links WHERE user_id=? OR chat_id=?',[row['user_id'],row['chat_id']])
        sql.execute('INSERT INTO telegram_links(customer_id,user_id,chat_id,generation,created_at) VALUES(?,?,?,?,?)',[customer_id,row['user_id'],row['chat_id'],Axiom.token,Axiom.now])
        sql.execute('INSERT OR IGNORE INTO notification_preferences(customer_id) VALUES(?)',[customer_id])
        sql.execute('DELETE FROM telegram_link_tokens WHERE customer_id=?',[customer_id])
        link(customer_id)
      end
    end
    def unlink(customer_id)
      transaction do
        sql.execute("UPDATE telegram_deliveries SET state='cancelled' WHERE customer_id=? AND state IN ('pending','sending')",[customer_id])
        sql.execute("UPDATE secure_actions SET state='cancelled' WHERE customer_id=? AND generation IS NOT NULL AND state='pending'",[customer_id])
        %w[telegram_links telegram_link_tokens telegram_callbacks telegram_conversations].each{|table|sql.execute("DELETE FROM #{table} WHERE customer_id=?",[customer_id])}
        sql.execute('UPDATE notification_preferences SET telegram_enabled=0 WHERE customer_id=?',[customer_id])
      end
    end
    def callback(customer_id,hash,action,resource)
      current=link(customer_id);raise Error.new(409,'Telegram belum ditautkan.') unless current
      sql.execute('INSERT INTO telegram_callbacks VALUES(?,?,?,?,?,?,NULL)',[hash,customer_id,current['generation'],action,resource,Axiom.now+600000])
    end
    def consume(hash,user_id)
      transaction do
        row=sql.get_first_row('SELECT t.*,l.user_id,l.chat_id FROM telegram_callbacks t JOIN telegram_links l ON l.customer_id=t.customer_id AND l.generation=t.generation WHERE t.token_hash=? AND l.user_id=? AND l.blocked=0 AND t.used_at IS NULL AND t.expires_at>?',[hash,user_id,Axiom.now])
        next nil unless row
        sql.execute('UPDATE telegram_callbacks SET used_at=? WHERE token_hash=? AND used_at IS NULL',[Axiom.now,hash]);row
      end
    end
    def conversation(customer_id)
      row=sql.get_first_row('SELECT v.* FROM telegram_conversations v JOIN telegram_links l ON l.customer_id=v.customer_id AND l.generation=v.generation WHERE v.customer_id=? AND v.expires_at>?',[customer_id,Axiom.now])
      row && row.merge('payload'=>JSON.parse(row['payload_json']))
    end
    def converse(customer_id,step,payload={})
      current=link(customer_id);return unless current
      sql.execute('INSERT INTO telegram_conversations VALUES(?,?,?,?,?) ON CONFLICT(customer_id) DO UPDATE SET generation=excluded.generation,step=excluded.step,payload_json=excluded.payload_json,expires_at=excluded.expires_at',[customer_id,current['generation'],step,JSON.generate(payload),Axiom.now+1800000])
    end
    def cancel(customer_id) = sql.execute('DELETE FROM telegram_conversations WHERE customer_id=?',[customer_id])
    def begin_menu(chat_id)
      transaction do
        chat_id=chat_id.to_s
        revision=sql.get_first_value('INSERT INTO telegram_menus(chat_id,revision) VALUES(?,1) ON CONFLICT(chat_id) DO UPDATE SET revision=revision+1 RETURNING revision',[chat_id])
        sql.execute("UPDATE telegram_deliveries SET state='cancelled' WHERE chat_id=? AND menu_revision<? AND state='pending'",[chat_id,revision])
        sql.execute('UPDATE telegram_callbacks SET used_at=? WHERE used_at IS NULL AND customer_id IN (SELECT customer_id FROM telegram_links WHERE chat_id=?)',[Axiom.now,chat_id])
        queue_menu_cleanup(chat_id)
        revision
      end
    end
    def menu_messages(chat_id,after:Axiom.now-172800000)
      sql.execute("SELECT d.id,d.message_id FROM telegram_deliveries d JOIN telegram_menus m ON m.chat_id=d.chat_id WHERE d.chat_id=? AND d.menu_revision<m.revision AND d.state='sent' AND d.method IN ('sendMessage','sendPhoto','sendDocument') AND d.message_id IS NOT NULL AND d.sent_at>? AND d.ticket_id IS NULL AND d.support_message_id IS NULL AND NOT EXISTS(SELECT 1 FROM support_telegram_messages s WHERE s.chat_id=d.chat_id AND s.message_id=d.message_id)",[chat_id,after])
    end
    def queue_menu_cleanup(chat_id)
      menu_messages(chat_id).each do |message|
        enqueue(chat_id:chat_id,method:'deleteMessages',payload:{message_ids:[message['message_id']]},event_key:"menu-delete:#{message['id']}")
      end
    end
    def enqueue(chat_id:,method:,payload:,customer_id:nil,generation:nil,event_key:nil,ticket_id:nil,support_message_id:nil,menu_revision:nil,available_at:Axiom.now,admin_required:false)
      text=payload[:text] || payload['text']
      if method=='sendMessage' && text.is_a?(String) && text.length>3500
        chunks=text.each_char.each_slice(3500).map(&:join)
        chunks.each_with_index do |chunk,index|
          part=payload.dup
          part.delete('text');part[:text]=chunk
          if index<chunks.length-1;part.delete(:reply_markup);part.delete('reply_markup');end
          enqueue(chat_id:chat_id,method:method,payload:part,customer_id:customer_id,generation:generation,event_key:event_key && "#{event_key}:part:#{index}",ticket_id:ticket_id,support_message_id:support_message_id,menu_revision:menu_revision,available_at:available_at,admin_required:admin_required)
        end
        return
      end
      menu_revision=nil if ticket_id || support_message_id || !%w[sendMessage sendPhoto sendDocument].include?(method)
      transaction do
        current=menu_revision && sql.get_first_value('SELECT revision FROM telegram_menus WHERE chat_id=?',[chat_id.to_s])
        state=menu_revision && current!=menu_revision ? 'cancelled' : 'pending'
        sql.execute('INSERT OR IGNORE INTO telegram_deliveries(event_key,customer_id,chat_id,generation,method,payload_json,available_at,ticket_id,support_message_id,admin_required,menu_revision,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[event_key,customer_id,chat_id.to_s,generation,method,JSON.generate(payload),available_at,ticket_id,support_message_id,admin_required ? 1 : 0,menu_revision,state])
      end
    end
    def ingest(update)
      message=update.dig('callback_query','message') || update['message']
      sender=update.dig('callback_query','from') || message&.dig('from')
      binding=sender && message && actor(sender['id'].to_s,message.dig('chat','id').to_s)
      payload=update.merge('_received_generation'=>binding && binding['generation'],'_received_customer_id'=>binding && binding['customer_id'])
      if update['message'].is_a?(Hash) && update['message']['text'].to_s.match?(%r{\A/start(?:@[A-Za-z0-9_]+)? [A-Za-z0-9_-]{43}\z})
        token=update['message']['text'].split(' ',2).last
        payload=payload.merge('_link_token_hash'=>Axiom.digest(token),'message'=>update['message'].merge('text'=>'/start [redacted]'))
      end
      sql.execute('INSERT OR IGNORE INTO telegram_updates(update_id,payload_json,created_at) VALUES(?,?,?)',[update['update_id'],JSON.generate(payload),Axiom.now])
    end
    def claim_update
      transaction do
        row=sql.get_first_row("SELECT * FROM telegram_updates WHERE (state='pending' AND next_attempt_at<=?) OR (state='processing' AND lease_until<?) ORDER BY update_id LIMIT 1",[Axiom.now,Axiom.now])
        next nil unless row
        token=Axiom.token
        sql.execute("UPDATE telegram_updates SET state='processing',lease_until=?,lease_token=?,attempts=attempts+1 WHERE update_id=?",[Axiom.now+120000,token,row['update_id']])
        row.merge('lease_token'=>token)
      end
    end
    def update_owned?(row)
      sql.get_first_value("SELECT 1 FROM telegram_updates WHERE update_id=? AND lease_token=? AND state='processing'",[row['update_id'],row['lease_token']])
    end
    def finish_update(row,error=nil)
      sql.execute('UPDATE telegram_updates SET state=?,error_class=?,lease_until=NULL,lease_token=NULL WHERE update_id=? AND lease_token=?',[error ? 'failed' : 'done',error,row['update_id'],row['lease_token']])
    end
    def retry_update(row,error,retry_after=nil)
      attempts=sql.get_first_value('SELECT attempts FROM telegram_updates WHERE update_id=?',[row['update_id']])
      if attempts>=5
        finish_update(row,error)
        return false
      end
      delay=retry_after ? [[retry_after.to_i,1].max,86400].min*1000 : 30000*(2**(attempts-1))
      sql.execute("UPDATE telegram_updates SET state='pending',next_attempt_at=?,lease_token=NULL,lease_until=NULL,error_class=? WHERE update_id=? AND lease_token=?",[Axiom.now+delay,error,row['update_id'],row['lease_token']])
      true
    end
    def preferences(id)
      sql.execute('INSERT OR IGNORE INTO notification_preferences(customer_id) VALUES(?)',[id]);sql.get_first_row('SELECT * FROM notification_preferences WHERE customer_id=?',[id])
    end
    def preferences_update(id,values)
      preferences(id);sql.execute('UPDATE notification_preferences SET payments=?,withdrawals=?,support=?,security=?,digest=?,quiet_start=?,quiet_end=?,telegram_enabled=? WHERE customer_id=?',values+[id])
    end
    def claim_delivery
      transaction do
        now=Axiom.now
        next nil if sql.get_first_value("SELECT value FROM telegram_runtime WHERE name='next_send'").to_i>now
        row=sql.get_first_row("SELECT * FROM telegram_deliveries d WHERE ((state='pending' AND available_at<=?) OR (state='sending' AND lease_until<=?)) AND NOT EXISTS(SELECT 1 FROM telegram_runtime r WHERE r.name='chat:'||d.chat_id AND CAST(r.value AS INTEGER)>?) ORDER BY id LIMIT 1",[now,now,now])
        next nil unless row
        if row['menu_revision'] && sql.get_first_value('SELECT revision FROM telegram_menus WHERE chat_id=?',[row['chat_id']])!=row['menu_revision']
          sql.execute("UPDATE telegram_deliveries SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=?",[row['id']]);next nil
        end
        if row['method']=='deleteMessages'
          payload=JSON.parse(row['payload_json'])
          ids=menu_messages(row['chat_id']).map{|message|message['message_id']} & payload.fetch('message_ids',[])
          if ids.empty?
            sql.execute("UPDATE telegram_deliveries SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=?",[row['id']]);next nil
          end
          sql.execute('UPDATE telegram_deliveries SET payload_json=? WHERE id=?',[JSON.generate({message_ids:ids}),row['id']])
        end
        current=row['customer_id'] && link(row['customer_id'])
        if row['admin_required']==1 && (!current || sql.get_first_value('SELECT role FROM customers WHERE id=?',[row['customer_id']])!='admin' || !ENV.fetch('TELEGRAM_ADMIN_IDS','').split(',').map(&:strip).include?(current['user_id']))
          sql.execute("UPDATE telegram_deliveries SET state='cancelled' WHERE id=?",[row['id']]);next nil
        end
        if row['generation'] && (!current || current['generation']!=row['generation'] || current['blocked']==1)
          sql.execute("UPDATE telegram_deliveries SET state='cancelled' WHERE id=?",[row['id']]);next nil
        end
        token=Axiom.token
        sql.execute("UPDATE telegram_deliveries SET state='sending',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?",[token,now+120000,row['id']])
        sql.execute("INSERT INTO telegram_runtime VALUES('next_send',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",[(now+50).to_s])
        sql.execute('INSERT INTO telegram_runtime VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',["chat:#{row['chat_id']}",(now+1100).to_s])
        sql.get_first_row('SELECT * FROM telegram_deliveries WHERE id=?',[row['id']])
      end
    end
    def delivered(row,result)
      transaction do
        message_id=result.is_a?(Hash) ? result['message_id'] : nil
        sent_at=result.is_a?(Hash) && result['date'].is_a?(Integer) ? result['date']*1000 : Axiom.now
        sql.execute("UPDATE telegram_deliveries SET state='sent',message_id=?,sent_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",[message_id,sent_at,row['id'],row['lease_token']])
        next unless sql.changes==1
        if row['method']=='deleteMessages'
          ids=JSON.parse(row['payload_json']).fetch('message_ids',[])
          menu_messages(row['chat_id'],after:0).each do |message|
            sql.execute("UPDATE telegram_deliveries SET state='deleted' WHERE id=?",[message['id']]) if ids.include?(message['message_id'])
          end
        elsif row['ticket_id'] && message_id
          ticket=sql.get_first_row('SELECT customer_id FROM support_tickets WHERE id=?',[row['ticket_id']])
          sql.execute('INSERT OR IGNORE INTO support_telegram_messages VALUES(?,?,?,?,?,?)',[row['chat_id'],message_id,row['ticket_id'],row['support_message_id'],ticket['customer_id'],row['generation']]) if ticket
        elsif row['menu_revision'] && message_id
          queue_menu_cleanup(row['chat_id'])
        end
      end
    end
    def delivery_failed(row,code,retry_after=nil)
      transaction do
        stale=row['menu_revision'] && sql.get_first_value('SELECT revision FROM telegram_menus WHERE chat_id=?',[row['chat_id']])!=row['menu_revision']
        terminal=[400,401,403,404].include?(code) || row['attempts']>=5
        delay=code==429 ? [[retry_after.to_i,1].max,86400].min*1000 : 30000*(2**(row['attempts']-1))
        state=stale ? 'cancelled' : (terminal ? 'failed' : 'pending')
        sql.execute('UPDATE telegram_deliveries SET state=?,available_at=?,lease_token=NULL,lease_until=NULL,error_class=? WHERE id=? AND lease_token=?',[state,Axiom.now+delay,"Telegram#{code}",row['id'],row['lease_token']])
        sql.execute('UPDATE telegram_links SET blocked=1 WHERE customer_id=? AND generation=?',[row['customer_id'],row['generation']]) if code==403 && row['customer_id']
        sql.execute("INSERT INTO telegram_runtime VALUES('next_send',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",[(Axiom.now+delay).to_s]) if code==429
      end
    end
    def polling_offset = sql.get_first_value('SELECT COALESCE(MAX(update_id),-1)+1 FROM telegram_updates')
    def schedules
      sql.execute("SELECT p.*,l.chat_id,l.generation,c.role FROM notification_preferences p JOIN telegram_links l ON l.customer_id=p.customer_id JOIN customers c ON c.id=p.customer_id WHERE p.telegram_enabled=1 AND l.blocked=0 AND p.digest<>'off'")
    end
    def schedule_once(key)
      sql.execute('INSERT OR IGNORE INTO scheduler_runs VALUES(?,?)',[key,Axiom.now]);sql.changes==1
    end
  end
end
