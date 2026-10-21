# frozen_string_literal: true
require_relative 'outbox_store'
require_relative 'telegram_store'
module Axiom
  class SupportStore
    def initialize(db)
      @db=db;@outbox=OutboxStore.new(db);@telegram=TelegramStore.new(db)
    end
    def sql = @db.connection
    def get(id) = sql.get_first_row('SELECT * FROM support_tickets WHERE id=?',[id])
    def page(customer_id,limit,offset,search:'',status:'all',viewer_id:customer_id,admin:nil)
      admin=customer_id.nil? if admin.nil?
      conditions=[];args=[]
      if customer_id
        conditions<<'t.customer_id=?';args<<customer_id
      end
      if status!='all'
        conditions<<'t.status=?';args<<status
      end
      unless search.empty?
        pattern="%#{search.gsub(/[\\%_]/){|c|"\\#{c}"}}%"
        conditions<<"(t.id LIKE ? ESCAPE '\\' OR t.subject LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM support_messages s WHERE s.ticket_id=t.id #{admin ? '' : 'AND s.internal=0'} AND s.body LIKE ? ESCAPE '\\'))"
        args.concat([pattern,pattern,pattern])
      end
      where=conditions.empty? ? '1=1' : conditions.join(' AND ')
      visible=admin ? '' : 'AND internal=0'
      total=sql.get_first_value("SELECT COUNT(*) FROM support_tickets t WHERE #{where}",args)
      rows=sql.execute(<<~SQL,[viewer_id,viewer_id]+args+[limit,offset])
        SELECT t.*,c.username,lm.body last_message,lm.created_at last_message_at,lm.id latest_message_id,
          (SELECT COUNT(*) FROM support_messages u WHERE u.ticket_id=t.id #{admin ? '' : 'AND u.internal=0'}
            AND u.actor_id!=? AND u.id>COALESCE((SELECT r.message_id FROM support_reads r WHERE r.ticket_id=t.id AND r.viewer_id=?),0)) unread_count
        FROM support_tickets t JOIN customers c ON c.id=t.customer_id
        LEFT JOIN support_messages lm ON lm.id=(SELECT MAX(id) FROM support_messages WHERE ticket_id=t.id #{visible})
        WHERE #{where} ORDER BY lm.created_at DESC,lm.id DESC,t.id LIMIT ? OFFSET ?
      SQL
      [rows,total]
    end
    def messages(id,admin,before:nil,limit:50)
      args=[id];args<<before if before
      rows=sql.execute(<<~SQL,args+[limit])
        SELECT m.id,m.ticket_id,m.actor_id,c.username actor_username,m.channel,m.body,m.internal,m.created_at,
          m.attachment_name,m.attachment_type,q.id reply_to_id,qc.username reply_actor_username,q.body reply_body,q.attachment_name reply_attachment_name,
          CASE WHEN m.internal=1 THEN 0 WHEN m.actor_id=t.customer_id THEN EXISTS (
            SELECT 1 FROM support_reads r JOIN customers reader ON reader.id=r.viewer_id
            WHERE r.ticket_id=m.ticket_id AND r.message_id>=m.id AND reader.role='admin' AND reader.id!=m.actor_id
          ) ELSE EXISTS (
            SELECT 1 FROM support_reads r WHERE r.ticket_id=m.ticket_id AND r.viewer_id=t.customer_id AND r.message_id>=m.id
          ) END read_by_other
        FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id LEFT JOIN customers c ON c.id=m.actor_id
        LEFT JOIN support_messages q ON q.id=m.reply_to_id AND q.ticket_id=m.ticket_id AND (q.internal=0 #{admin ? 'OR m.internal=1' : ''})
        LEFT JOIN customers qc ON qc.id=q.actor_id
        WHERE m.ticket_id=? #{admin ? '' : 'AND m.internal=0'} #{before ? 'AND m.id<?' : ''}
        ORDER BY m.id DESC LIMIT ?
      SQL
      rows.reverse.map do |row|
        row['reply_to']=row['reply_to_id'] && {'id'=>row['reply_to_id'],'actor_username'=>row['reply_actor_username'],'body'=>row['reply_body'],'attachment_name'=>row['reply_attachment_name']}
        row.delete('reply_actor_username');row.delete('reply_body');row.delete('reply_attachment_name')
        row['read_by_other']=row['read_by_other']==1
        row
      end
    end
    def read_watermark(id,viewer_id)
      sql.get_first_value('SELECT message_id FROM support_reads WHERE ticket_id=? AND viewer_id=?',[id,viewer_id]) || 0
    end
    def mark_read(id,viewer_id,message_id,admin)
      @db.transaction do
        visible=sql.get_first_value("SELECT id FROM support_messages WHERE ticket_id=? AND id=? #{admin ? '' : 'AND internal=0'}",[id,message_id])
        raise Error.new(404,'Pesan tidak ditemukan.') unless visible
        sql.execute('INSERT INTO support_reads(ticket_id,viewer_id,message_id,updated_at) VALUES(?,?,?,?) ON CONFLICT(ticket_id,viewer_id) DO UPDATE SET message_id=MAX(support_reads.message_id,excluded.message_id),updated_at=excluded.updated_at',[id,viewer_id,message_id,Axiom.now])
        read_watermark(id,viewer_id)
      end
    end
    def replay(actor_id,request_id,fingerprint)
      return nil unless request_id
      row=sql.get_first_row('SELECT * FROM support_requests WHERE actor_id=? AND request_id=?',[actor_id,request_id])
      raise Error.new(409,'ID permintaan telah digunakan untuk pesan yang berbeda.') if row && row['fingerprint']!=fingerprint
      row
    end
    def remember(actor_id,request_id,fingerprint,ticket_id,message_id)
      return unless request_id
      sql.execute('INSERT INTO support_requests(actor_id,request_id,fingerprint,ticket_id,message_id) VALUES(?,?,?,?,?)',[actor_id,request_id,fingerprint,ticket_id,message_id])
    end
    def attachment(id) = sql.get_first_row('SELECT m.*,t.customer_id FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE m.id=?',[id])
    def create(customer_id,subject,body,channel,attachment=nil,request_id:nil,fingerprint:nil)
      @db.transaction do
        previous=replay(customer_id,request_id,fingerprint)
        next get(previous['ticket_id']) if previous
        id="AXS-#{SecureRandom.hex(6).upcase}";now=Axiom.now
        sql.execute("INSERT INTO support_tickets VALUES(?,?,?,'OPEN',?,?)",[id,customer_id,subject,now,now])
        message_id=add(id,customer_id,body,channel,false,false,attachment,inside:true)
        remember(customer_id,request_id,fingerprint,id,message_id)
        get(id)
      end
    end
    def add(id,actor_id,body,channel,admin,internal,attachment=nil,inside:false,reply_to_id:nil,request_id:nil,fingerprint:nil)
      operation=proc do
        previous=replay(actor_id,request_id,fingerprint)
        next previous['message_id'] if previous
        ticket=get(id);raise Error.new(404,'Tiket tidak ditemukan.') unless ticket
        raise Error.new(409,'Buka kembali tiket sebelum membalas.') if ticket['status']=='CLOSED'
        if reply_to_id
          quoted=sql.get_first_value("SELECT id FROM support_messages WHERE id=? AND ticket_id=? #{admin && internal ? '' : 'AND internal=0'}",[reply_to_id,id])
          raise Error.new(404,'Pesan tidak ditemukan.') unless quoted
        end
        sql.execute('INSERT INTO support_messages(ticket_id,actor_id,channel,body,internal,created_at,attachment_name,attachment_type,attachment,reply_to_id) VALUES(?,?,?,?,?,?,?,?,?,?)',[id,actor_id,channel,body,internal ? 1 : 0,Axiom.now,attachment && attachment[:name],attachment && attachment[:type],attachment && SQLite3::Blob.new(attachment[:data]),reply_to_id])
        message_id=sql.last_insert_row_id
        remember(actor_id,request_id,fingerprint,id,message_id)
        sql.execute('UPDATE support_tickets SET status=?,updated_at=? WHERE id=?',[internal ? ticket['status'] : admin ? 'WAITING_CUSTOMER' : 'WAITING_ADMIN',Axiom.now,id])
        unless internal
          event={kind:'support',id:id,status:admin ? 'REPLIED' : 'RECEIVED',reference:id,subject:ticket['subject'],message:body}
          if admin
            @outbox.enqueue(event_key:"support:#{message_id}",customer_id:ticket['customer_id'],payload:event)
          else
            ENV.fetch('TELEGRAM_ADMIN_IDS','').split(',').map(&:strip).each do |telegram_id|
              operator=@telegram.actor(telegram_id,telegram_id);next unless operator && operator['role']=='admin'
              @telegram.enqueue(chat_id:operator['chat_id'],customer_id:operator['customer_id'],generation:operator['generation'],method:'sendMessage',payload:{text:"Tiket #{id}\n#{ticket['subject']}\n\n#{body}\n#{attachment ? 'Lampiran tersedia pada halaman aman.\n' : ''}Balas pesan ini untuk menjawab pelanggan.\n#{ENV['PUBLIC_URL']}/admin/bantuan/#{id}"},event_key:"support:#{message_id}:operator:#{operator['customer_id']}",ticket_id:id,support_message_id:message_id,admin_required:true)
            end
          end
        end
        message_id
      end
      inside ? operation.call : @db.transaction(&operation)
    end
    def status(id,value)
      sql.execute('UPDATE support_tickets SET status=?,updated_at=? WHERE id=?',[value,Axiom.now,id]);get(id)
    end
    def mapped_reply(chat_id,message_id)
      sql.get_first_row('SELECT * FROM support_telegram_messages WHERE chat_id=? AND message_id=?',[chat_id.to_s,message_id])
    end
  end
end
