# frozen_string_literal: true
require_relative '../../infrastructure/persistence/telegram_store'
require_relative '../../infrastructure/persistence/outbox_store'
module Axiom
  class TelegramIdentity
    attr_reader :store
    def initialize(db,username)
      @store=TelegramStore.new(db);@username=username;@outbox=OutboxStore.new(db)
    end
    def current(customer_id)
      {configured:!!(@username && @username.match?(/\A[A-Za-z0-9_]{5,32}\z/)),username:@username,link:store.link(customer_id)&.slice('user_id','chat_id','created_at','blocked'),pending:store.pending(customer_id),preferences:store.preferences(customer_id)}
    end
    def start(customer_id)
      raise Error.new(503,'Bot Telegram belum dikonfigurasi.') unless @username && @username.match?(/\A[A-Za-z0-9_]{5,32}\z/)
      raise Error.new(409,'Putuskan tautan aktif sebelum menautkan ulang.') if store.link(customer_id)
      token=Axiom.token;store.start(customer_id,Axiom.digest(token));{url:"https://t.me/#{@username}?start=#{token}",expires_in:300}
    end
    def claim(token,user_id,chat_id,display)
      raise Error.new(400,'Tautan tidak valid atau kedaluwarsa.') unless token.is_a?(String) && token.match?(/\A[A-Za-z0-9_-]{43}\z/) && user_id==chat_id && user_id.match?(/\A[1-9]\d{0,19}\z/)
      claim_hash(Axiom.digest(token),user_id,chat_id,display)
    end
    def claim_hash(hash,user_id,chat_id,display)
      raise Error.new(400,'Tautan tidak valid.') unless hash.is_a?(String) && hash.match?(/\A[a-f0-9]{64}\z/) && user_id==chat_id && user_id.match?(/\A[1-9]\d{0,19}\z/)
      row=store.claim(hash,user_id,chat_id,display.to_s[0,100])
      raise Error.new(400,'Tautan tidak valid atau sudah dipakai.') unless row
      row['customer_id']
    end
    def confirm(customer_id,user_id)
      raise Error.new(400,'Identitas Telegram tidak valid.') unless user_id.is_a?(String) && user_id.match?(/\A[1-9]\d{0,19}\z/)
      store.transaction do
        link=store.confirm(customer_id,user_id)
        @outbox.enqueue(event_key:"security:telegram-link:#{link['generation']}",customer_id:customer_id,payload:{kind:'security',status:'Telegram ditautkan',reference:user_id,message:'Tautan Telegram baru diaktifkan setelah konfirmasi web. Putuskan dari akun jika bukan Anda.'})
        link
      end
    end
    def unlink(customer_id)
      store.transaction do
        link=store.link(customer_id)
        store.unlink(customer_id)
        @outbox.enqueue(event_key:"security:telegram-unlink:#{link['generation']}",customer_id:customer_id,payload:{kind:'security',status:'Telegram diputus',reference:link['user_id'],message:'Tautan, tombol dan percakapan Telegram lama telah dibatalkan.'}) if link
      end
      {unlinked:true}
    end
    def callback(customer_id,action,resource)
      token=SecureRandom.urlsafe_base64(24,false);store.callback(customer_id,Axiom.digest(token),action,resource);token
    end
    def consume_callback(token,user_id)
      return nil unless token.is_a?(String) && token.match?(/\A[A-Za-z0-9_-]{32}\z/)
      store.consume(Axiom.digest(token),user_id.to_s)
    end
    def preferences(customer_id,body)
      old=store.preferences(customer_id)
      flags=%w[payments withdrawals support security telegram_enabled].to_h{|key|v=body.fetch(key,old[key]==1);raise Error.new(400,'Preferensi tidak valid.') unless [true,false].include?(v);[key,v ? 1 : 0]}
      digest=body.fetch('digest',old['digest']);raise Error.new(400,'Ringkasan tidak valid.') unless %w[off daily monthly].include?(digest)
      hours=%w[quiet_start quiet_end].map{|key|v=body.fetch(key,old[key]);raise Error.new(400,'Jam tenang harus 0–23 WIB.') unless v.nil? || (v.is_a?(Integer)&&v.between?(0,23));v}
      raise Error.new(400,'Isi kedua batas jam tenang.') unless hours.all?(&:nil?) || hours.none?(&:nil?)
      store.preferences_update(customer_id,[flags['payments'],flags['withdrawals'],flags['support'],flags['security'],digest,*hours,flags['telegram_enabled']]);store.preferences(customer_id)
    end
  end
end
