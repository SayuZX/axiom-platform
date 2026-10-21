# frozen_string_literal: true
require 'cgi'
require_relative 'telegram_store'
module Axiom
  class OutboxStore
    def initialize(db) = @db=db
    def sql = @db.connection
    def enqueue(event_key:,customer_id:,payload:)
      return unless customer_id
      recipient=sql.get_first_value('SELECT email FROM customers WHERE id=?',[customer_id]);return unless recipient
      sql.execute('INSERT OR IGNORE INTO email_outbox(event_key,customer_id,recipient,payload_json,available_at,created_at) VALUES(?,?,?,?,?,?)',[event_key,customer_id,recipient,JSON.generate(payload),Axiom.now,Axiom.now])
      sql.execute('INSERT OR IGNORE INTO notification_events VALUES(?,?,?,?)',[event_key,customer_id,JSON.generate(payload),Axiom.now])
      telegram=TelegramStore.new(@db);link=telegram.link(customer_id);preferences=telegram.preferences(customer_id)
      kind=payload[:kind] || payload['kind'];category={'payment'=>'payments','withdrawal'=>'withdrawals','support'=>'support','security'=>'security'}[kind]
      if link && link['blocked']==0 && preferences['telegram_enabled']==1 && (!category || preferences[category]==1)
        values=payload.transform_keys(&:to_s)
        labels={'payment'=>'Transaksi','withdrawal'=>'Penarikan','support'=>'Bantuan','security'=>'Keamanan akun','policy'=>'Ketentuan layanan'}
        states={'PENDING'=>'Menunggu pembayaran','PAID'=>'Selesai terkonfirmasi','EXPIRED'=>'Kedaluwarsa','REQUESTED'=>'Diajukan','PROCESSING'=>'Diproses','REJECTED'=>'Ditolak','REPLIED'=>'Balasan pengelola','RECEIVED'=>'Pesan diterima'}
        lines=["#{labels[kind] || 'Pemberitahuan'} Axiom Payment","Referensi: #{values['reference']}","Status: #{states[values['status']] || values['status']}"]
        {'amount'=>'Nominal','fee_amount'=>'Komisi','net_amount'=>'Neto'}.each{|key,label|lines<<"#{label}: Rp#{values[key]}" if values[key]}
        lines<<"Rekening: #{values['bank_name']} ••••#{values['account_last4']}" if values['account_last4']
        lines<<values['message'] if values['message']
        lines<<"Alasan: #{values['rejection_reason']}" if values['rejection_reason']
        lines<<"Referensi transfer: #{values['transfer_reference']}" if values['transfer_reference']
        route=kind=='payment' ? 'transaksi' : kind=='withdrawal' ? 'penarikan' : kind=='support' ? 'bantuan' : 'akun'
        link_url=kind=='policy' ? "#{ENV['PUBLIC_URL']}/terms-of-service?version=#{values['id']}" : "#{ENV['PUBLIC_URL']}/dashboard/#{route}#{kind=='security' ? '' : '/'+values['id'].to_s}"
        text=(lines+[link_url]).join("\n")
        due=Axiom.now
        if kind!='security' && preferences['quiet_start'] && preferences['quiet_end'] && preferences['quiet_start']!=preferences['quiet_end']
          time=Time.now.getlocal('+07:00');hour=time.hour;start=preferences['quiet_start'];finish=preferences['quiet_end']
          quiet=start<finish ? hour>=start&&hour<finish : hour>=start||hour<finish
          if quiet
            ending=Time.new(time.year,time.month,time.day,finish,0,0,'+07:00');ending+=86400 if ending<=time;due=ending.to_i*1000
          end
        end
        receipt=values['status']=='PAID' && (kind=='withdrawal' || (kind=='payment' && values['event']=='PAID'))
        method=receipt ? 'sendPhoto' : 'sendMessage'
        if receipt
          escape=->(value){CGI.escapeHTML(value.to_s)}
          money=->(value){'Rp'+value.to_i.to_s.reverse.scan(/.{1,3}/).join('.').reverse}
          heading=kind=='payment' ? 'Pembayaran berhasil diterima' : 'Penarikan berhasil diselesaikan'
          caption=["✓ <b>#{heading}</b>",'',"<b>Nominal:</b> #{money.call(values['amount'])}"]
          if kind=='payment'
            caption<<"<b>Komisi:</b> #{money.call(values['fee_amount'])}"
            caption<<"<b>Dana neto:</b> #{money.call(values['net_amount'])}"
          else
            caption<<"<b>Tujuan:</b> #{escape.call(values['bank_name'])} ••••#{escape.call(values['account_last4'])}"
            caption<<"<b>Referensi transfer:</b> <code>#{escape.call(values['transfer_reference'])}</code>"
          end
          caption<<"<b>Referensi:</b> <code>#{escape.call(values['reference'])}</code>"
          caption+=['','Bukti transaksi terlampir.', '<i>Terima kasih telah menggunakan Axiom Payment.</i>',"<a href=\"#{escape.call(link_url)}\">Lihat detail transaksi ↗</a>"]
          delivery={caption:caption.join("\n"),parse_mode:'HTML',receipt:{kind:kind,id:values['id']}}
        else
          delivery={text:text}
        end
        telegram.enqueue(chat_id:link['chat_id'],customer_id:customer_id,generation:link['generation'],event_key:event_key,method:method,payload:delivery,available_at:due)
        if kind=='payment' && (payload[:event] || payload['event'])=='created' && (payload[:status] || payload['status'])=='PENDING'
          telegram.enqueue(chat_id:link['chat_id'],customer_id:customer_id,generation:link['generation'],event_key:event_key+':qr',method:'sendPhoto',payload:{photo:"#{ENV['PUBLIC_URL']}/api/qr-image/#{payload[:id] || payload['id']}",caption:"QRIS #{payload[:reference] || payload['reference']} — Rp#{payload[:amount] || payload['amount']}"},available_at:due)
        end
      end
    end
    def payment(row,event)
      enqueue(event_key:"payment:#{row['id']}:#{event}",customer_id:row['customer_id'],payload:{kind:'payment',id:row['id'],reference:row['trx_id'],status:event=='created' ? row['status'] : event,event:event,amount:row['amount'],fee_amount:row['fee_amount'],net_amount:row['amount']-row['fee_amount']})
    end
    def withdrawal(row)
      enqueue(event_key:"withdrawal:#{row['id']}:#{row['status']}",customer_id:row['customer_id'],payload:{kind:'withdrawal',id:row['id'],reference:row['id'],status:row['status'],amount:row['amount'],bank_name:row['bank_name'],account_last4:row['account_number'][-4,4],transfer_reference:row['transfer_reference'],rejection_reason:row['rejection_reason']})
    end
    def claim
      @db.transaction do
        row=sql.get_first_row("SELECT * FROM email_outbox WHERE (state='pending' AND available_at<=?) OR (state='sending' AND lease_until<=?) ORDER BY id LIMIT 1",[Axiom.now,Axiom.now])
        next nil unless row
        token=Axiom.token
        sql.execute("UPDATE email_outbox SET state='sending',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?",[token,Axiom.now+120000,row['id']])
        sql.get_first_row('SELECT * FROM email_outbox WHERE id=?',[row['id']])
      end
    end
    def accepted(row)
      sql.execute("UPDATE email_outbox SET state='accepted',accepted_at=?,lease_until=NULL,lease_token=NULL,error_class=NULL WHERE id=? AND lease_token=?",[Axiom.now,row['id'],row['lease_token']])
    end
    def failed(row,error_class)
      permanent=%w[Net::SMTPFatalError Net::SMTPAuthenticationError Net::SMTPSyntaxError].include?(error_class)
      state=permanent || row['attempts']>=5 ? 'failed' : 'pending'
      sql.execute('UPDATE email_outbox SET state=?,available_at=?,lease_until=NULL,lease_token=NULL,error_class=? WHERE id=? AND lease_token=?',[state,Axiom.now+30000*(2**(row['attempts']-1)),error_class,row['id'],row['lease_token']])
    end
  end
end
