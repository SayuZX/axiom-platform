# frozen_string_literal: true
require_relative '../../infrastructure/persistence/action_store'
require_relative 'auth'
require_relative '../payments/payments'
require_relative '../withdrawals/withdrawals'
module Axiom
  class SecureActions
    attr_reader :store
    def initialize(db,config)
      @store=ActionStore.new(db);@telegram=TelegramStore.new(db);@auth=Auth.new(db,config);@payments=Payments.new(db,config);@withdrawals=Withdrawals.new(db);@config=config
    end
    def verify_password(user,password)
      @auth.store.limit('step-up',user['id'],10,900000)
      row=@auth.store.customer(user['id'])
      raise Error.new(401,'Kata sandi tidak valid.') unless @auth.password?(password) && Axiom.equal_secret(@auth.password_hash(password,row['password_salt']),row['password_hash'])
      true
    end
    def confirm(user,id,password)
      verify_password(user,password);row=store.claim(id,user['id']);body=row['payload'];channel=row['generation'] ? 'telegram_web' : 'web'
      if row['state']=='done'
        return {state:'done',resource_id:row['resource_id'],kind:row['kind']}
      end
      if row['kind']=='payment'
        if row['resource_id']
          result=@payments.verify(id:row['resource_id'],customer_id:user['id'])
          store.finish(id,row['resource_id']);notify_action(row,result[:data])
          return result.merge(resource_id:row['resource_id'],kind:'payment')
        end
        raise Error.new(409,'Permintaan sedang diproses. Jangan buat pengganti; periksa kembali.') unless row['state']=='claimed'
        begin
          result=@payments.create(customer_id:user['id'],amount:body['amount'],action_id:id)
        rescue Error
          store.release_unreserved(id)
          raise
        end
        if result[:success]
          store.finish(id,result[:data]['qris_id']);store.audit(user,'payment.create',result[:data]['qris_id'],'success',channel)
          notify_action(row,result[:data])
          return result.merge(resource_id:result[:data]['qris_id'],kind:'payment')
        end
        raise Error.new(result[:http_status],result[:message])
      elsif row['kind']=='withdrawal'
        return store.transaction do
          store.get(id,user['id'])
          account=store.account(user['id'])
          raise Error.new(409,'Rekening belum terverifikasi atau sudah berubah.') unless account && account['status']=='VERIFIED' && %w[bank_name account_number account_holder].all?{|k|account[k]==body[k]}
          code,data=@withdrawals.create(customer_id:user['id'],body:body.merge('expected_customer_id'=>user['id'],'request_id'=>id))
          store.finish(id,data[:withdrawal]['id']);store.audit(user,'withdrawal.create',data[:withdrawal]['id'],'success',channel)
          notify_action(row,data[:withdrawal])
          data.merge(resource_id:data[:withdrawal]['id'],kind:'withdrawal')
        end
      elsif row['kind']=='withdrawal_status'
        return store.transaction do
          store.get(id,user['id'])
          current=@auth.store.customer(user['id'])
          raise Error.new(403,'Akses administrator diperlukan.') unless current && current['role']=='admin'
          link=@telegram.link(user['id']) if row['generation']
          if row['generation']
            raise Error.new(403,'Identitas admin Telegram tidak diizinkan.') unless link && link['generation']==row['generation'] && ENV.fetch('TELEGRAM_ADMIN_IDS','').split(',').map(&:strip).include?(link['user_id'])
          end
          data=@withdrawals.transition(actor_id:user['id'],id:body['id'],body:body)
          store.finish(id,body['id']);store.audit(user,'withdrawal.status',body['id'],'success',channel,link && link['user_id'])
          notify_action(row,data[:withdrawal])
          data.merge(resource_id:body['id'],kind:'withdrawal')
        end
      end
      raise Error.new(400,'Tindakan tidak dikenal.')
    rescue Error=>e
      store.release_unreserved(id) if row && row['kind']!='payment'
      store.audit(user,'action.confirm',id,"rejected:#{e.status}",channel||'web')
      raise
    end
    def notify_action(action,resource)
      return unless action['generation']
      link=@telegram.link(action['customer_id'])
      return unless link && link['generation']==action['generation'] && link['blocked']==0
      payment=action['kind']=='payment'
      id=payment ? resource['qris_id'] : resource['id']
      text=payment ? "Invoice #{resource['trx_id']}\nBruto Rp#{resource['amount']}\nKomisi Rp#{resource['fee_amount']}\nNeto Rp#{resource['net_amount']}\nStatus #{resource['status']}\nBerlaku sampai #{resource['expires_at']}" : "Penarikan #{id}\nRp#{resource['amount']}\nStatus #{resource['status']}"
      url=payment ? resource['qr_url'] : "#{@config.origin}/#{action['kind']=='withdrawal_status' ? 'admin' : 'dashboard'}/penarikan/#{id}"
      @telegram.enqueue(chat_id:link['chat_id'],customer_id:action['customer_id'],generation:link['generation'],event_key:"action-result:#{action['id']}",method:'sendMessage',payload:{text:text,reply_markup:{inline_keyboard:[[{text:'Buka rincian',url:url},{text:'Salin tautan',copy_text:{text:url}}]]}},admin_required:action['kind']=='withdrawal_status')
      if payment && resource['status']=='PENDING'
        @telegram.enqueue(chat_id:link['chat_id'],customer_id:action['customer_id'],generation:link['generation'],event_key:"action-result:#{action['id']}:qr",method:'sendPhoto',payload:{photo:"#{@config.origin}/api/qr-image/#{id}",caption:"QRIS #{resource['trx_id']} — Rp#{resource['amount']}"})
      end
    end
    def request_account(user,body)
      verify_password(user,body['password'])
      data={'bank_name'=>@withdrawals.text(body['bank_name'],'Nama bank',2,80),'account_holder'=>@withdrawals.text(body['account_holder'],'Pemilik rekening',2,120),'account_number'=>body['account_number']}
      raise Error.new(400,'Nomor rekening harus 6–34 digit.') unless data['account_number'].is_a?(String)&&data['account_number'].match?(/\A\d{6,34}\z/)
      store.request_account(user['id'],data)
    end
  end
end
