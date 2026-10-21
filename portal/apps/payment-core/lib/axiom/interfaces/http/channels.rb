# frozen_string_literal: true
require_relative '../../application/identity/telegram_identity'
require_relative '../../application/identity/secure_actions'
require_relative '../../application/support/support'
require_relative '../../infrastructure/integrations/telegram_api'
module Axiom
  class App
    set :telegram_identity, TelegramIdentity.new(settings.database,ENV['TELEGRAM_BOT_USERNAME'])
    set :secure_actions, SecureActions.new(settings.database,settings.config)
    set :support_service, Support.new(settings.database)
    get('/api/telegram') do
      data=settings.telegram_identity.current(session!['id'])
      data[:configured]=!!TelegramAPI.new.configured?
      answer(data:data)
    end
    post('/api/telegram/link') do
      session!;client=TelegramAPI.new
      raise Error.new(503,'Bot Telegram belum dikonfigurasi.') unless client.configured?
      begin
        client.verify!
      rescue TelegramAPI::DeliveryError
        raise Error.new(503,'Identitas bot belum dapat diverifikasi. Coba lagi nanti.')
      end
      answer(data:settings.telegram_identity.start(@user['id']))
    end
    post('/api/telegram/confirm') do
      session!;settings.secure_actions.verify_password(@user,request_data['password'])
      answer(data:{link:settings.telegram_identity.confirm(@user['id'],request_data['user_id'])})
    end
    delete('/api/telegram/link') { answer(data:settings.telegram_identity.unlink(session!['id'])) }
    post('/api/telegram/preferences') { answer(data:{preferences:settings.telegram_identity.preferences(session!['id'],request_data)}) }
    post('/api/telegram/webhook') do
      secret=ENV.fetch('TELEGRAM_WEBHOOK_SECRET','')
      raise Error.new(403,'Webhook tidak valid.') unless ENV['TELEGRAM_MODE']=='webhook' && secret.length>=32 && Axiom.equal_secret(request.env['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'].to_s,secret)
      update=request_data;raise Error.new(400,'Update Telegram tidak valid.') unless update['update_id'].is_a?(Integer) && update['update_id']>=0
      settings.telegram_identity.store.ingest(update);answer
    end
    get('/api/actions/:id') do
      row=settings.secure_actions.store.get(params['id'],session!['id']);answer(data:{action:row.slice('id','kind','state','resource_id','expires_at','payload')})
    end
    post('/api/actions/:id/confirm') { answer(data:settings.secure_actions.confirm(session!,params['id'],request_data['password'])) }
    get('/api/bank-account') { answer(data:{account:settings.secure_actions.store.account(session!['id'])}) }
    post('/api/bank-account') { answer(data:{account:settings.secure_actions.request_account(session!,request_data)}) }
    post('/api/admin/customers/:id/bank-account/verify') do
      admin!;settings.secure_actions.verify_password(@user,request_data['password']);settings.secure_actions.store.verify_account(params['id'],@user['id'],request_data['revision']);settings.secure_actions.store.audit(@user,'bank-account.verify',params['id'],'success');answer
    end
    ['/api/support','/api/admin/support'].each do |base|
      get(base) do
        user=base.include?('/admin/') ? admin! : session!;limit=page_number('limit',20,100,1);offset=page_number('offset',0,2147483647)
        rows,total=settings.support_service.page(user,limit,offset,search:params.fetch('search',''),status:params.fetch('status','all'),admin:base.include?('/admin/'))
        answer(data:{tickets:rows,total:total,limit:limit,offset:offset,service_hours:ENV['SUPPORT_SERVICE_HOURS']})
      end
      get(base+'/:id') do
        user=base.include?('/admin/') ? admin! : session!;limit=page_number('limit',50,100,1)
        before=params.key?('before') ? page_number('before',0,9223372036854775807,1) : nil
        answer(data:settings.support_service.detail(user,params['id'],before:before,limit:limit))
      end
      post(base+'/:id/messages') do
        user=base.include?('/admin/') ? admin! : session!;id=settings.support_service.reply(user,params['id'],request_data);answer({data:{message_id:id}},201)
      end
      post(base+'/:id/read') do
        user=base.include?('/admin/') ? admin! : session!
        answer(data:{message_id:settings.support_service.mark_read(user,params['id'],request_data['message_id'])})
      end
      post(base+'/:id/status') { user=base.include?('/admin/') ? admin! : session!;answer(data:{ticket:settings.support_service.change_status(user,params['id'],request_data['status'])}) }
    end
    post('/api/support') { answer({data:{ticket:settings.support_service.view(settings.support_service.create(session!,request_data))}},201) }
    get('/api/support-attachments/:id') do
      user=session!;row=settings.support_service.store.attachment(params['id']);raise Error.new(404,'Lampiran tidak ditemukan.') unless row && row['attachment'] && (user['role']=='admin' || (row['customer_id']==user['id'] && row['internal']==0))
      content_type row['attachment_type'];headers 'Content-Disposition'=>"attachment; filename=\"#{row['attachment_name'].gsub(/[\"\\\r\n]/,'_')}\"",'Content-Security-Policy'=>"default-src 'none'; sandbox";row['attachment']
    end
  end
end
