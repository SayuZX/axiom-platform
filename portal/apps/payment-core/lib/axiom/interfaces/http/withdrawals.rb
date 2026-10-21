# frozen_string_literal: true
require_relative '../../application/withdrawals/withdrawals'
module Axiom
  class App
    set :withdrawals_service, Withdrawals.new(settings.database)
    get('/api/wallet') { answer(data:{wallet:settings.withdrawals_service.store.wallet(session!['id']),processing_days:{min:1,max:2}}) }
    get('/api/withdrawal-destinations') { session!;answer(data:{groups:WithdrawalDestinations::GROUPS}) }
    get('/api/withdrawals') do
      session!;limit=page_number('limit',20,100,1);offset=page_number('offset',0,2147483647)
      rows,total=settings.withdrawals_service.store.page(customer_id:@user['id'],status:selected_status(%w[all REQUESTED PROCESSING PAID REJECTED]),limit:limit,offset:offset)
      answer(data:{withdrawals:rows.map{|r|settings.withdrawals_service.view(r)},total:total,limit:limit,offset:offset})
    end
    post('/api/withdrawals') do
      session!;settings.secure_actions.verify_password(@user,request_data['password'])
      code,data=settings.withdrawals_service.create(customer_id:@user['id'],body:request_data);answer({data:data},code)
    end
    get('/api/withdrawals/:id') { answer(data:settings.withdrawals_service.detail(params['id'],customer_id:session!['id'])) }
    get('/api/admin/withdrawals/:id') { admin!;answer(data:settings.withdrawals_service.detail(params['id'],admin:true)) }
    post('/api/admin/withdrawals/:id/status') do
      admin!;settings.secure_actions.verify_password(@user,request_data['password'])
      channel=request_data['channel']=='telegram_web' ? 'telegram_web' : 'web'
      link=settings.telegram_identity.store.link(@user['id']) if channel=='telegram_web'
      if channel=='telegram_web'
        raise Error.new(403,'Identitas Telegram admin tidak diizinkan.') unless link && ENV.fetch('TELEGRAM_ADMIN_IDS','').split(',').map(&:strip).include?(link['user_id'])
      end
      begin
        data=settings.withdrawals_service.transition(actor_id:@user['id'],id:params['id'],body:request_data)
        settings.secure_actions.store.audit(@user,'withdrawal.status',params['id'],'success',channel,link && link['user_id'])
        answer(data:data)
      rescue Error=>e
        settings.secure_actions.store.audit(@user,'withdrawal.status',params['id'],"rejected:#{e.status}",channel,link && link['user_id']);raise
      end
    end
  end
end
