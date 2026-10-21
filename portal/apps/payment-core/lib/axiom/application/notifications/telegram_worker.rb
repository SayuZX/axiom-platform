# frozen_string_literal: true
require_relative '../../interfaces/telegram/assistant'
require_relative '../../infrastructure/integrations/telegram_api'
require_relative '../receipts/receipts'
module Axiom
  class TelegramWorker
    def initialize(db,config)
      @db=db;@config=config;@store=TelegramStore.new(db);@api=TelegramAPI.new;@assistant=Assistant.new(db,config)
      @verified=false
    end
    def tick
      return unless @api.configured?
      return if @verify_after && Axiom.now<@verify_after
      unless @verified
        @api.verify!;@verified=true
      end
      20.times do
        row=@store.claim_update;break unless row
        update=JSON.parse(row['payload_json'])
        begin
          message=update['message'];file=message && (message['document'] || message['photo']&.last)
          if file
            type=message['document'] ? file['mime_type'] : 'image/jpeg'
            raise Error.new(400,'Gunakan PNG, JPEG, atau PDF maksimal 2 MB.') unless %w[image/png image/jpeg application/pdf].include?(type) && file['file_size'].is_a?(Integer) && file['file_size']<=2097152
            data=@api.attachment(file['file_id']);message['_attachment']={'name'=>file['file_name']||'foto.jpg','type'=>type,'data'=>Base64.strict_encode64(data)}
          end
          @db.transaction do
            next unless @store.update_owned?(row)
            @assistant.process(update);@store.finish_update(row)
          end
        rescue TelegramAPI::DeliveryError=>e
          retried=@store.retry_update(row,"Telegram#{e.code}",e.retry_after)
          unless retried
            chat=update.dig('message','chat','id')
            @store.enqueue(chat_id:chat,method:'sendMessage',payload:{text:'Lampiran belum dapat diambil setelah beberapa percobaan. Pesan belum tersimpan sebagai tiket. Kirim ulang atau gunakan halaman Bantuan.'},event_key:"attachment-failed:#{row['update_id']}") if chat
          end
        rescue Error=>e
          if e.status>=500
            @store.retry_update(row,e.class.name)
          else
            chat=update.dig('message','chat','id');@store.enqueue(chat_id:chat,method:'sendMessage',payload:{text:e.message},event_key:"attachment-error:#{row['update_id']}") if chat
            @store.finish_update(row,e.class.name)
          end
        rescue StandardError=>e
          @store.finish_update(row,e.class.name);warn "Telegram update failure: #{e.class}"
        end
      end
      schedule
      20.times do
        row=@store.claim_delivery;break unless row
        begin
          payload=JSON.parse(row['payload_json']);payload['chat_id']=row['chat_id'] unless row['method']=='answerCallbackQuery'
          receipt=payload.delete('receipt')
          photo=receipt ? Receipts.new(@db).png(receipt.fetch('kind'),receipt.fetch('id'),{'id'=>row['customer_id'],'role'=>'customer'}) : nil
          result=photo ? @api.call(row['method'],payload,photo:photo) : @api.call(row['method'],payload)
          @store.delivered(row,result)
        rescue TelegramAPI::DeliveryError=>e
          @store.delivery_failed(row,e.code,e.retry_after)
        rescue Error=>e
          @store.delivery_failed(row,e.status>=500 ? 503 : 400,nil)
        end
      end
    rescue TelegramAPI::DeliveryError=>e
      @verify_after=Axiom.now+[e.retry_after.to_i*1000,30000].max
      warn "Telegram connection unavailable: #{e.code}"
    end
    def poll
      raise 'Polling tidak aktif.' unless @api.mode=='polling'
      @api.verify! unless @verified;@verified=true
      updates=@api.call('getUpdates',{offset:@store.polling_offset,timeout:20,allowed_updates:%w[message callback_query]})
      updates.each{|update|@store.ingest(update)}
    end
    def schedule
      return if @next_schedule && Axiom.now<@next_schedule
      @next_schedule=Axiom.now+60000
      time=Time.now.getlocal('+07:00');return if time.hour<8
      @store.schedules.each do |pref|
        next if pref['digest']=='monthly' && time.day!=1
        start= pref['quiet_start'];finish=pref['quiet_end']
        next if start && finish && start!=finish && (start<finish ? time.hour>=start&&time.hour<finish : time.hour>=start||time.hour<finish)
        period=time.strftime(pref['digest']=='monthly' ? '%Y-%m' : '%Y-%m-%d')
        @db.transaction do
          next unless @store.schedule_once("digest:#{pref['customer_id']}:#{pref['digest']}:#{period}")
          date=Date.new(time.year,time.month,time.day)
          date=pref['digest']=='monthly' ? date.prev_month : date-1
          report=Reports.new(@db).read(pref['customer_id'],pref['digest'],date.to_s);totals=report[:totals];wallet=WithdrawalStore.new(@db).wallet(pref['customer_id'])
          @store.enqueue(chat_id:pref['chat_id'],customer_id:pref['customer_id'],generation:pref['generation'],event_key:"digest:#{pref['customer_id']}:#{pref['digest']}:#{period}",method:'sendMessage',payload:{text:"Ringkasan #{pref['digest']=='daily' ? 'harian' : 'bulanan'} periode #{report[:date]}\nBerdasarkan tanggal pembuatan invoice dalam WIB.\nTerbayar #{totals['count']}: bruto Rp#{totals['gross_amount']}, komisi Rp#{totals['fee_amount']}, neto Rp#{totals['net_amount']}\nSaldo saat ini: tersedia Rp#{wallet['available_amount']}, dicadangkan Rp#{wallet['reserved_amount']}\n#{@config.origin}/dashboard"})
        end
      end
      ENV.fetch('TELEGRAM_ADMIN_IDS','').split(',').map(&:strip).each do |uid|
        actor=@store.actor(uid,uid);next unless actor && actor['role']=='admin'
        key="admin-digest:#{actor['customer_id']}:#{time.strftime('%Y-%m-%d')}"
        @db.transaction do
          next unless @store.schedule_once(key)
          totals=AdminStore.new(@db).overview;report=OperationsStore.new(@db).report
          @store.enqueue(chat_id:uid,customer_id:actor['customer_id'],generation:actor['generation'],event_key:key,method:'sendMessage',admin_required:true,payload:{text:"Ringkasan operasional otomatis\nKomisi diakui Rp#{totals['fee_amount']}\nPenarikan menunggu #{totals['requested_count']} / Rp#{totals['requested_amount']}\nTiket menunggu #{report[:pending_support]}\nEmail gagal #{report[:email].select{|r|r['state']=='failed'}.sum{|r|r['count']}}\n#{@config.origin}/admin/operasional"})
        end
      end
    end
  end
end
