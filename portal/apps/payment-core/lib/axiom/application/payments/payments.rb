# frozen_string_literal: true
require_relative '../../infrastructure/integrations/merchant_bridge'
require 'rqrcode'
require_relative '../../infrastructure/persistence/payment_store'
module Axiom
  class Payments
    attr_reader :store
    def initialize(db,config)
      @store=PaymentStore.new(db);@config=config;@bridge=MerchantBridge.new(config)
    end
    def amount(value, minimum=1)
      raise Error.new(400,"Nominal harus Rupiah bulat Rp#{minimum}–Rp10.000.000.") unless (value.is_a?(Integer) || value.is_a?(String)) && value.to_s.match?(/\A[1-9]\d*\z/) && value.to_i.between?(minimum,10000000)
      value.to_i
    end
    def ready?
      @bridge.request('/api/merchant/user-config').dig('merchant','id')==@config.merchant_id
    rescue Error
      false
    end
    def new_fees(amount)
      fee=(amount*200)/10000
      {fee_rate_bps:200,fee_amount:fee,fee_policy:'percentage_200bps',net_amount:amount-fee}
    end
    def fees(row) = row.slice('fee_rate_bps','fee_amount','fee_policy').merge('net_amount'=>row['amount']-row['fee_amount'])
    def view(row,qr:false)
      data={'qris_id'=>row['id'],'trx_id'=>row['trx_id'],'amount'=>row['amount'],'status'=>row['status'],'created_at'=>Axiom.iso(row['created_at']),'expires_at'=>Axiom.iso(row['expires_at']),'qr_url'=>"#{@config.origin}/qr/#{row['id']}"}.merge(fees(row))
      data['qris_string']=row['qr'] if qr
      data
    end
    def public_view(row)
      {'qris_id'=>row['id'],'trx_id'=>row['trx_id'],'amount'=>row['amount'],'status'=>row['status'],'expires_at'=>Axiom.iso(row['expires_at'])}
    end
    def create(customer_id:,amount:,action_id:nil)
      value=self.amount(amount)
      raise Error.new(503,'Merchant utama tidak sesuai konfigurasi.') unless ready?
      now=Axiom.now;row={'id'=>SecureRandom.urlsafe_base64(18,false),'trx_id'=>"AXP-#{SecureRandom.hex(16)}",'amount'=>value,'qr'=>'','created_at'=>now,'expires_at'=>now+900000,'status'=>'PENDING','customer_id'=>customer_id}.merge(new_fees(value).slice(:fee_rate_bps,:fee_amount,:fee_policy).transform_keys(&:to_s))
      store.reserve(row,action_id:action_id)
      begin
        observed=@bridge.request('/api/payment/generate-qris',{amount:value,order_id:row['trx_id']})
        {success:true,data:view(apply(row,observed),qr:true)}
      rescue Error => e
        {success:false,http_status:e.status,message:'QRIS belum dapat dikonfirmasi. Simpan ID ini dan periksa status; jangan membuat invoice pengganti sebelum hasilnya jelas.',data:view(store.get(row['id']))}
      end
    end
    def apply(row,observed)
      valid=observed['order_id']==row['trx_id'] && observed['currency']=='IDR' && observed['amount'].is_a?(Integer) && observed['amount']==row['amount'] && observed['transaction_id'].is_a?(String) && !observed['transaction_id'].empty? && (!row['provider_id'] || row['provider_id']==observed['transaction_id'])
      raise Error.new(502,'Identitas atau nominal pembayaran provider tidak sesuai.') unless valid
      state={'settlement'=>'PAID','pending'=>'PENDING','expire'=>'EXPIRED','cancel'=>'EXPIRED','deny'=>'EXPIRED','failure'=>'EXPIRED'}[observed['status']]
      raise Error.new(502,'Status provider belum dapat diverifikasi.') unless state
      raw=observed['expires_at'];raise Error.new(502,'Masa berlaku QRIS provider tidak valid.') unless raw.is_a?(String)
      raw=raw.tr(' ','T')+'Z' if raw.match?(/\A\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\z/)
      begin
        expiry=(Time.iso8601(raw).to_r*1000).to_i
      rescue ArgumentError
        raise Error.new(502,'Masa berlaku QRIS provider tidak valid.')
      end
      qr=observed['qr_string'] || row['qr']
      raise Error.new(502,'QRIS provider belum tersedia; periksa status pembayaran.') if state=='PENDING' && (!qr.is_a?(String) || !qr.start_with?('000201'))
      tx=state=='PAID' ? {'transaction_id'=>observed['transaction_id'],'order_id'=>observed['order_id'],'amount'=>row['amount'],'payer_issuer'=>'QRIS','payment_type'=>'QRIS','transaction_time'=>observed['settlement_time'] || observed['transaction_time'],'confirmed_at'=>Axiom.iso(Axiom.now)}.merge(fees(row)) : nil
      state='EXPIRED' if state=='PENDING' && expiry<Axiom.now
      store.apply(row['id'],observed,state,expiry,qr || '',tx)
    end
    def owned(id,customer_id:,public_access:false)
      raise Error.new(400,'qris_id atau trx_id pembayaran diperlukan.') unless id.is_a?(String) && id.match?(/\A[A-Za-z0-9_-]{8,64}\z/)
      row=store.get(id)
      raise Error.new(404,'Pembayaran tidak ditemukan.') unless row && (public_access || !customer_id || row['customer_id']==customer_id)
      row
    end
    def verify(id:,customer_id:,public_access:false,requested_amount:nil)
      store.expire;row=owned(id,customer_id:customer_id,public_access:public_access)
      raise Error.new(400,'Nominal tidak sesuai pembayaran.') if requested_amount && amount(requested_amount)!=row['amount']
      unless row['status']=='PAID'
        raise Error.new(503,'Invoice versi lama memerlukan rekonsiliasi administrator.') if !row['provider_id'] && !row['trx_id'].start_with?('AXP-')
        row=apply(row,@bridge.request('/api/payment/status/'+URI.encode_www_form_component(row['trx_id'])))
      end
      result={paid:row['status']=='PAID',status:row['status'],data:public_access ? public_view(row) : view(row)}
      result[:transaction]=JSON.parse(row['transaction_json']).merge(fees(row)) if !public_access && row['status']=='PAID'
      result
    end
    def qr_image(id)
      row=owned(id,customer_id:nil,public_access:true)
      raise Error.new(503,'QRIS belum tersedia; periksa status pembayaran.') if row['qr'].empty?
      raise Error.new(410,'QRIS tidak lagi aktif.') unless row['status']=='PENDING' && row['expires_at']>=Axiom.now
      RQRCode::QRCode.new(row['qr'],level: :m).as_png(size:360,border_modules:3).to_s
    end
  end
end
