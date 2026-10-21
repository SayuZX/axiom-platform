# frozen_string_literal: true
require_relative '../../infrastructure/persistence/admin_store'
module Axiom
  class App
    set :admin_store, AdminStore.new(settings.database)
    before('/api/admin/*') { admin! }
    get('/api/admin/overview') { answer(data:{totals:settings.admin_store.overview,processing_days:{min:1,max:2}}) }
    get('/api/admin/customers') do
      limit=page_number('limit',25,100,1);offset=page_number('offset',0,2147483647)
      rows,total=settings.admin_store.customers(search_text,limit,offset)
      answer(data:{customers:rows,total:total,limit:limit,offset:offset})
    end
    get('/api/admin/customers/:id') { answer(data:{customer:settings.admin_store.customer(params['id'])}) }
    post('/api/admin/customers/:id/api-key-limit') do
      settings.secure_actions.verify_password(@user,request_data['password'])
      answer(data:{customer:settings.admin_store.key_limit(params['id'],request_data['max_active_api_keys'],@user['id'])})
    end
    get('/api/admin/payments') do
      payments.store.expire;limit=page_number('limit',25,100,1);offset=page_number('offset',0,2147483647)
      rows,total=settings.admin_store.payments(selected_status(%w[all PENDING PAID EXPIRED]),search_text,params['customer_id'],limit,offset)
      answer(data:{payments:rows.map{|r|payments.view(r).merge(r.slice('username','customer_id'))},total:total,limit:limit,offset:offset})
    end
    get('/api/admin/withdrawals') do
      limit=page_number('limit',25,100,1);offset=page_number('offset',0,2147483647)
      rows,total=settings.admin_store.withdrawals(selected_status(%w[all REQUESTED PROCESSING PAID REJECTED]),params['customer_id'],limit,offset)
      answer(data:{withdrawals:rows.map{|r|settings.withdrawals_service.view(r,admin:true)},total:total,limit:limit,offset:offset})
    end
    get('/api/admin/commissions') { answer(data:settings.admin_store.commissions) }
    get('/api/admin/audit') do
      limit=page_number('limit',25,100,1);offset=page_number('offset',0,2147483647);rows,total=settings.admin_store.audit(limit,offset)
      answer(data:{events:rows.map{|r|r.merge('created_at'=>Axiom.iso(r['created_at']))},total:total,limit:limit,offset:offset})
    end
  end
end
