# frozen_string_literal: true
require_relative '../../infrastructure/persistence/withdrawal_store'
require_relative 'destinations'
module Axiom
  class Withdrawals
    attr_reader :store
    def initialize(db) = @store=WithdrawalStore.new(db)
    def text(value,name,min,max)
      raise Error.new(400,"#{name} tidak valid.") unless value.is_a?(String) && value.strip.length.between?(min,max) && !value.match?(/[\p{Cc}\p{Cf}\p{Cs}]/)
      value.strip
    end
    def view(row,admin:false)
      data=row.reject{|k,_|%w[customer_id request_id].include?(k)}
      %w[requested_at updated_at estimated_start_at estimated_end_at processed_at completed_at rejected_at].each{|k|data[k]=Axiom.iso(row[k])}
      data['customer_id']=row['customer_id'] if admin
      data
    end
    def create(customer_id:,body:)
      raise Error.new(400,'Identitas akun pada formulir diperlukan. Muat ulang halaman.') unless body['expected_customer_id'].is_a?(String) && !body['expected_customer_id'].empty?
      raise Error.new(409,'Akun masuk berubah. Muat ulang halaman sebelum mengajukan penarikan.',code:'account_changed') unless body['expected_customer_id']==customer_id
      raise Error.new(400,'Nominal harus bilangan bulat rupiah positif yang aman.') unless body['amount'].is_a?(Integer) && body['amount'].between?(1,9007199254740991)
      input=body.slice('request_id','amount','account_number').merge('bank_name'=>text(body['bank_name'],'Nama bank',2,80),'account_holder'=>text(body['account_holder'],'Nama pemilik rekening',2,120))
      raise Error.new(400,'Nomor rekening harus berisi 6–34 digit.') unless input['account_number'].is_a?(String) && input['account_number'].match?(/\A[0-9]{6,34}\z/)
      raise Error.new(400,'ID permintaan tidak valid.') unless input['request_id'].is_a?(String) && input['request_id'].match?(/\A[A-Za-z0-9_-]{16,100}\z/)
      store.transaction do
        previous=store.previous(customer_id,input['request_id'])
        if previous
          raise Error.new(409,'ID permintaan sudah digunakan untuk rincian penarikan yang berbeda.') unless input.all?{|k,v|previous[k]==v}
          next [200,{withdrawal:view(previous),wallet:store.wallet(customer_id)}]
        end
        WithdrawalDestinations.validate!(input['bank_name'],input['account_number'])
        raise Error.new(409,'Saldo tersedia tidak mencukupi.',code:'insufficient_balance') if input['amount']>store.wallet(customer_id)['available_amount']
        row=store.insert(customer_id,input)
        [201,{withdrawal:view(row),wallet:store.wallet(customer_id)}]
      end
    end
    def transition(actor_id:,id:,body:)
      status=body['status'];raise Error.new(400,'Status tujuan tidak valid.') unless %w[PROCESSING PAID REJECTED].include?(status)
      reference=nil;reason=nil
      if status=='PAID'
        reference=text(body['transfer_reference'],'Referensi transfer',5,120)
        raise Error.new(400,'Konfirmasi transfer manual yang sudah selesai wajib diberikan.') unless body['confirm_transferred']==true
      elsif body.key?('transfer_reference') || body.key?('confirm_transferred')
        raise Error.new(400,'Bukti transfer hanya berlaku untuk status PAID.')
      end
      if status=='REJECTED'
        reason=text(body['rejection_reason'],'Alasan penolakan',5,500)
      elsif body.key?('rejection_reason')
        raise Error.new(400,'Alasan penolakan hanya berlaku untuk status REJECTED.')
      end
      store.transaction do
        row=store.get(id);raise Error.new(404,'Penarikan tidak ditemukan.') unless row
        if row['status']==status
          raise Error.new(409,'Status sudah dicatat dengan bukti yang berbeda.') unless row['transfer_reference']==reference && row['rejection_reason']==reason
        else
          allowed={'REQUESTED'=>%w[PROCESSING REJECTED],'PROCESSING'=>%w[PAID REJECTED]}.fetch(row['status'],[])
          raise Error.new(409,'Perubahan status penarikan tidak diizinkan.') unless allowed.include?(status)
          row=store.update(row,actor_id,status,reference,reason)
        end
        {withdrawal:view(row,admin:true),wallet:store.wallet(row['customer_id'])}
      end
    end
    def detail(id,customer_id:nil,admin:false)
      row=store.get(id);raise Error.new(404,'Penarikan tidak ditemukan.') unless row && (admin || row['customer_id']==customer_id)
      {withdrawal:view(row,admin:admin),events:store.events(id).map{|e|e.merge('created_at'=>Axiom.iso(e['created_at']))}}
    end
  end
end
