# frozen_string_literal: true
require_relative '../../infrastructure/persistence/auth_store'
require_relative '../../infrastructure/integrations/mail_delivery'
module Axiom
  class Auth
    EMAIL=/\A[a-zA-Z0-9.!#$%&'*+\/?^_`{|}~=-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+\z/
    attr_reader :store, :mail
    def initialize(db, config)
      @store=AuthStore.new(db); @config=config; @mail=MailDelivery.new
      @dummy_salt=SecureRandom.hex(16); @dummy_hash=password_hash(Axiom.token,@dummy_salt)
    end
    def username?(v) = v.is_a?(String) && v.match?(/\A[a-zA-Z0-9_]{3,32}\z/)
    def password?(v) = v.is_a?(String) && v.length.between?(12,128) && v.bytesize<=512
    def email?(v) = v.is_a?(String) && v.length<=254 && EMAIL.match?(v) && v.split('@').first.length<=64 && !v.start_with?('.') && !v.include?('..') && !v.include?('.@')
    def password_hash(password,salt) = OpenSSL::KDF.scrypt(password,salt:salt,N:32768,r:8,p:1,length:64).unpack1('H*')
    def user(row)
      row && row.slice('id','username','email','role').merge('created_at'=>Axiom.iso(row['created_at']))
    end
    def session(token) = token.is_a?(String) && token.match?(/\A[A-Za-z0-9_-]{43}\z/) ? user(store.session(Axiom.digest(token))) : nil
    def customer(api_key:,token:)
      if api_key
        raise Error.new(401,'Kunci API tidak valid.') unless api_key.match?(/\Aaxp_[A-Za-z0-9_-]{43}\z/)
        row=user(store.key(Axiom.digest(api_key)))
      else
        row=session(token)
      end
      row || raise(Error.new(401,'Silakan masuk ke akun Anda.'))
    end
    def login(body,ip,previous_token)
      name=username?(body['username']) ? body['username'].downcase : ''
      store.limit('login-ip',ip,30,900000); store.limit('login-user',name,10,900000)
      row=store.by_username(name); valid=password?(body['password'])
      hash=password_hash(valid ? body['password'] : 'invalid-password',row ? row['password_salt'] : @dummy_salt)
      raise Error.new(401,'Nama pengguna atau kata sandi tidak valid.') unless Axiom.equal_secret(hash,row ? row['password_hash'] : @dummy_hash) && row && valid
      token=Axiom.token
      store.transaction { store.logout(previous_token) if previous_token; store.session_create(row['id'],token) }
      [user(row),token]
    end
    def mail_limit(ip,email)
      store.limit('email-cooldown',email,1,60000); store.limit('email-send',email,5,3600000); store.limit('ip-send',ip,5,3600000)
    end
    def otp_hash(token,otp) = OpenSSL::HMAC.hexdigest('SHA256',token,otp)
    def send_otp(email,otp)
      mail.deliver(to:email,subject:'Kode verifikasi Axiom Payment',text:"Kode verifikasi Axiom Payment Anda: #{otp}\n\nKode berlaku selama 10 menit. Jangan bagikan kode ini kepada siapa pun. Jika Anda tidak membuat akun, abaikan email ini.",message_id:"otp-#{Axiom.token}@#{URI(@config.origin).host}")
    end
    def registration_view(token,email)
      local,domain=email.split('@'); {registration_id:token,email:"#{local[0]}***@#{domain}",expires_in:600,resend_after:60}
    end
    def register(body,ip,tos_version:nil)
      raise Error.new(503,'Verifikasi email belum tersedia. Hubungi pengelola.') unless mail.configured?
      name,email,password=body.values_at('username','email','password')
      raise Error.new(400,'Nama pengguna harus berisi 3–32 huruf, angka, atau garis bawah.') unless username?(name)
      raise Error.new(400,'Alamat email tidak valid.') unless email?(email)
      raise Error.new(400,'Kata sandi harus berisi 12–128 karakter dan paling banyak 512 byte.') unless password?(password)
      name=name.downcase; email=email.downcase
      raise Error.new(409,'Nama pengguna atau email sudah terdaftar.') if store.taken?(name,email)
      mail_limit(ip,email)
      salt=SecureRandom.hex(16); hash=password_hash(password,salt)
      token=Axiom.token; otp=format('%06d',SecureRandom.random_number(1000000)); now=Axiom.now; id=Axiom.digest(token)
      store.transaction do
        store.registration_create({'id'=>id,'username'=>name,'email'=>email,'password_hash'=>hash,'password_salt'=>salt,'otp_hash'=>otp_hash(token,otp),'created_at'=>now,'expires_at'=>now+600000,'sent_at'=>now})
        store.registration_consent(id,tos_version) if tos_version
      end
      begin
        send_otp(email,otp); store.registration_delivered(id)
      rescue StandardError
        store.registration_delete(id); raise
      end
      registration_view(token,email)
    end
    def registration_token(body)
      token=body['registration_id']; raise invalid_otp unless token.is_a?(String) && token.match?(/\A[A-Za-z0-9_-]{43}\z/)
      token
    end
    def invalid_otp = Error.new(400,'Kode verifikasi tidak valid atau sudah kedaluwarsa.')
    def resend(body,ip)
      token=registration_token(body); id=Axiom.digest(token); row=store.registration(id)
      raise invalid_otp unless row && row['attempts']<5 && row['delivered']==1
      raise Error.new(429,'Tunggu 60 detik sebelum meminta kode baru.') if row['sending']==1 || row['sent_at']+60000>Axiom.now
      mail_limit(ip,row['email']); row=store.claim_resend(id)
      raise Error.new(429,'Pengiriman kode sedang diproses.') unless row
      otp=format('%06d',SecureRandom.random_number(1000000))
      begin
        send_otp(row['email'],otp); raise invalid_otp unless store.resend_complete(id,otp_hash(token,otp))
      ensure
        store.resend_release(id)
      end
      registration_view(token,row['email'])
    end
    def verify(body,ip)
      store.limit('verify-ip',ip,60,600000)
      token=registration_token(body); row=store.attempt(Axiom.digest(token)); otp=body['otp']
      raise invalid_otp unless row && otp.is_a?(String) && otp.match?(/\A\d{6}\z/) && Axiom.equal_secret(otp_hash(token,otp),row['otp_hash'])
      session=Axiom.token; customer=store.activate(row,Axiom.token,session)
      [user(customer),session]
    end
    def key_view(row)
      row.merge('created_at'=>Axiom.iso(row['created_at']),'last_used_at'=>Axiom.iso(row['last_used_at']),'revoked_at'=>Axiom.iso(row['revoked_at']))
    end
    def keys(id) = store.keys(id).map { |row| key_view(row) }
    def create_key(id,body)
      name=body['name']
      raise Error.new(400,'Nama kunci harus berisi 1–60 karakter tanpa karakter kontrol.') unless name.is_a?(String) && name.strip.length.between?(1,60) && !name.match?(/[\p{Cc}\p{Cf}]/)
      secret="axp_#{Axiom.token}"; {key:key_view(store.key_create(id,name.strip,secret)),secret:secret}
    end
  end
end
