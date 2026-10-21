# frozen_string_literal: true
require 'base64'
require 'digest'
require 'json'
require_relative '../../infrastructure/persistence/support_store'
module Axiom
  class Support
    attr_reader :store
    def initialize(db) = @store=SupportStore.new(db)
    def owned(id,user)
      ticket=store.get(id);raise Error.new(404,'Tiket tidak ditemukan.') unless ticket && (user['role']=='admin'||ticket['customer_id']==user['id']);ticket
    end
    def text(value,max)
      raise Error.new(400,'Pesan harus berisi teks yang valid.') unless value.is_a?(String) && value.strip.length.between?(1,max) && !value.match?(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/)
      value.strip
    end
    def attachment(input)
      return nil unless input
      raise Error.new(400,'Lampiran tidak valid.') unless input.is_a?(Hash) && input['name'].is_a?(String) && input['name'].length.between?(1,120) && input['data'].is_a?(String) && input['data'].bytesize<=2800000
      begin
        bytes=Base64.strict_decode64(input['data'])
      rescue ArgumentError
        raise Error.new(400,'Lampiran tidak valid.')
      end
      type=input['type'];valid=case type
        when 'image/png' then bytes.start_with?("\x89PNG\r\n\x1a\n".b)
        when 'image/jpeg' then bytes.start_with?("\xff\xd8\xff".b)
        when 'application/pdf' then bytes.start_with?('%PDF-')
        else false
      end
      raise Error.new(400,'Gunakan PNG, JPEG, atau PDF maksimal 2 MB.') unless valid && bytes.bytesize.between?(1,2097152)
      {name:File.basename(input['name']).gsub(/[^\p{L}\p{N} ._-]/,'_'),type:type,data:bytes}
    end
    def view(ticket)
      row=ticket.merge('created_at'=>Axiom.iso(ticket['created_at']),'updated_at'=>Axiom.iso(ticket['updated_at']))
      row['last_message_at']=ticket['last_message_at'] && Axiom.iso(ticket['last_message_at']) if ticket.key?('last_message_at')
      row
    end
    def positive_id(value)
      raise Error.new(400,'ID pesan tidak valid.') unless value.is_a?(Integer) && value.between?(1,9223372036854775807)
      value
    end
    def request_key(value)
      return nil if value.nil?
      raise Error.new(400,'ID permintaan harus berupa UUID.') unless value.is_a?(String) && value.match?(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i)
      value.downcase
    end
    def fingerprint(kind,id,channel,body)
      Digest::SHA256.hexdigest(JSON.generate([kind,id,channel,body['subject'],body['message'],body['internal']==true,body['reply_to_id'],body['attachment'] && body['attachment'].values_at('name','type','data')]))
    end
    def page(user,limit,offset,search:'',status:'all',admin:false)
      raise Error.new(403,'Akses hanya untuk admin.') if admin && user['role']!='admin'
      raise Error.new(400,'Pencarian tidak valid.') unless search.is_a?(String) && search.length<=200
      raise Error.new(400,'Status tiket tidak valid.') unless %w[all OPEN WAITING_ADMIN WAITING_CUSTOMER CLOSED].include?(status)
      raise Error.new(400,'Halaman tidak valid.') unless limit.is_a?(Integer) && limit.between?(1,100) && offset.is_a?(Integer) && offset.between?(0,2147483647)
      rows,total=store.page(admin ? nil : user['id'],limit,offset,search:search.strip,status:status,viewer_id:user['id'],admin:admin)
      [rows.map{|row|view(row)},total]
    end
    def create(user,body,channel:'web',request_id:body['request_id'])
      subject=text(body['subject'],160);message=text(body['message'],4000);file=attachment(body['attachment']);key=request_key(request_id)
      store.create(user['id'],subject,message,channel,file,request_id:key,fingerprint:key && fingerprint('create',nil,channel,body))
    end
    def reply(user,id,body,channel:'web',reply_to_id:body['reply_to_id'],request_id:body['request_id'])
      owned(id,user);internal=body['internal']==true
      raise Error.new(400,'Pilihan catatan internal tidak valid.') unless body['internal'].nil? || [true,false].include?(body['internal'])
      raise Error.new(403,'Catatan internal hanya untuk admin.') if internal && user['role']!='admin'
      reply_to_id=positive_id(reply_to_id) unless reply_to_id.nil?
      message=text(body['message'],4000);file=attachment(body['attachment']);key=request_key(request_id)
      store.add(id,user['id'],message,channel,user['role']=='admin',internal,file,reply_to_id:reply_to_id,request_id:key,fingerprint:key && fingerprint('reply',id,channel,body.merge('reply_to_id'=>reply_to_id)))
    end
    def detail(user,id,before:nil,limit:50)
      ticket=owned(id,user);before=positive_id(before) unless before.nil?
      raise Error.new(400,'Batas riwayat tidak valid.') unless limit.is_a?(Integer) && limit.between?(1,100)
      rows=store.messages(id,user['role']=='admin',before:before,limit:limit+1)
      has_more=rows.length>limit;rows.shift if has_more
      {ticket:view(ticket),messages:rows.map{|r|r.merge('created_at'=>Axiom.iso(r['created_at']))},has_more:has_more,last_read_message_id:store.read_watermark(id,user['id']),service_hours:ENV['SUPPORT_SERVICE_HOURS'],automatic_notice:'Pesan tercatat dalam antrean. Pemberitahuan ini otomatis, bukan konfirmasi pengelola sedang membaca.'}
    end
    def mark_read(user,id,message_id)
      owned(id,user);store.mark_read(id,user['id'],positive_id(message_id),user['role']=='admin')
    end
    def change_status(user,id,status)
      owned(id,user);raise Error.new(400,'Status tiket tidak valid.') unless %w[OPEN CLOSED].include?(status)
      view(store.status(id,status))
    end
  end
end
