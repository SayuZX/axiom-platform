# frozen_string_literal: true
require_relative '../../application/payments/payments'
module Axiom
  class App
    set :payments_service, Payments.new(settings.database,settings.config)
    helpers do
      def page_number(name,default,maximum,minimum=0)
        value=params.fetch(name,default.to_s)
        raise Error.new(400,'Parameter halaman tidak valid.') unless value.is_a?(String) && value.match?(/\A\d+\z/) && value.to_i.between?(minimum,maximum)
        value.to_i
      end
      def selected_status(allowed)
        value=params.fetch('status','all');raise Error.new(400,'Filter status tidak valid.') unless allowed.include?(value);value
      end
      def search_text
        value=params.fetch('search','');raise Error.new(400,'Pencarian tidak valid.') unless value.is_a?(String) && value.length<=120 && !value.match?(/[\p{Cc}\p{Cf}]/);value.strip
      end
      def payments = settings.payments_service
      def payment_status(public_access:false)
        customer! unless public_access
        input=request.request_method=='POST' ? request_data : {}
        id=params['id'] || input['qris_id'] || params['qris_id'] || input['trx_id'] || params['trx_id']
        answer(payments.verify(id:id,customer_id:@user && @user['id'],public_access:public_access,requested_amount:input['amount'] || params['amount']))
      rescue Error => e
        status e.status
        row=id.is_a?(String) ? payments.store.get(id) : nil
        row=nil if !public_access && !@master && row && row['customer_id']!=@user&.dig('id')
        JSON.generate({success:false,paid:false,status:row ? row['status'] : 'NOT_FOUND',message:e.message}.merge(row ? {data:public_access ? payments.public_view(row) : payments.view(row)} : {}))
      end
    end
    get('/api/config') do
      customer!;raise Error.new(403,'Akses administrator diperlukan.') unless @master
      answer(data:{merchant_configured:!!settings.config.merchant,public_url:settings.config.origin,payment_methods:['QRIS'],service:'Axiom Payment'})
    end
    get('/token-status') do
      customer!;raise Error.new(403,'Akses administrator diperlukan.') unless @master
      raise Error.new(503,'Merchant utama berubah; koneksi dihentikan.') unless payments.ready?
      answer(data:{token_status:'valid',message:'Merchant utama aktif.'})
    end
    get('/api/logs') do
      customer!;raise Error.new(403,'Akses administrator diperlukan.') unless @master
      answer(logs:settings.activity_mutex.synchronize { settings.activity_log.dup })
    end
    post('/create-qris') do
      customer!
      settings.secure_actions.verify_password(@user,request_data['password']) unless request.env['HTTP_X_API_KEY']
      data=payments.create(customer_id:@user && @user['id'],amount:request_data['amount']);status(data.delete(:http_status)||200);JSON.generate(data)
    end
    get('/api/payments') do
      customer!;payments.store.expire;limit=page_number('limit',25,100,1);offset=page_number('offset',0,100000000)
      rows,total=payments.store.page(customer_id:@user && @user['id'],status:selected_status(%w[all PENDING PAID EXPIRED]),search:search_text,limit:limit,offset:offset)
      answer(data:{payments:rows.map{|r|payments.view(r)},total:total,limit:limit,offset:offset})
    end
    get('/api/payments/:id') { customer!;answer(data:{payment:payments.view(payments.owned(params['id'],customer_id:@user && @user['id']),qr:true)}) }
    get('/api/overview') do
      customer!;payments.store.expire;data=payments.store.overview(@user && @user['id'])
      data[:merchant]={mode:'shared',ready:payments.ready?};data[:user]={username:@user ? @user['username'] : 'administrator'}
      data[:wallet]=@user && settings.respond_to?(:withdrawals_service) ? settings.withdrawals_service.store.wallet(@user['id']) : nil
      answer(data:data)
    end
    get('/api/qr-status/:id') { payment_status(public_access:true) }
    get('/check-payment') { payment_status }
    post('/check-payment') { payment_status }
    get('/api/qr-image/:id') { content_type 'image/png';payments.qr_image(params['id']) }
    ['/transactions','/transactions/all'].each do |route|
      get(route) do
        customer!;now=Axiom.now
        default_start=route.end_with?('/all') ? Time.utc(Time.now.utc.year,Time.now.utc.month,1).to_i*1000 : now-259200000
        parse_time=->(key,default){params.key?(key) ? page_number(key,0,8640000000000)*1000 : default}
        start_at=parse_time.call('startTime',default_start);end_at=parse_time.call('endTime',now)
        raise Error.new(400,'Rentang maksimal 31 hari.') if start_at>end_at || end_at-start_at>2678400000
        limit=page_number('pageSize',20,100,1);offset=page_number('from',0,100000000)
        rows,total=payments.store.transactions(@user && @user['id'],start_at,end_at,limit,offset)
        txs=rows.map do |r|
          tx=JSON.parse(r['transaction_json']);{'amount'=>r['amount'],'status'=>'settlement','time'=>tx['transaction_time'],'issuer'=>tx['payer_issuer'],'order_id'=>tx['order_id'],'transaction_id'=>tx['transaction_id'],'qris_id'=>r['id'],'trx_id'=>r['trx_id']}.merge(payments.fees(r))
        end
        answer(total:total,from:offset,page_size:limit,total_amount:rows.sum{|r|r['amount']}.to_s,total_fee_amount:rows.sum{|r|r['fee_amount']}.to_s,total_net_amount:rows.sum{|r|r['amount']-r['fee_amount']}.to_s,data:{transactions:txs})
      end
    end
  end
end
