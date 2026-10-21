# frozen_string_literal: true
require_relative 'policy_store'
require_relative 'outbox_store'
require_relative 'action_store'
module Axiom
  class AuthStore
    def initialize(db) = @db = db
    def sql = @db.connection
    def transaction(&block) = @db.transaction(&block)
    def customer(id) = sql.get_first_row('SELECT * FROM customers WHERE id=?', [id])
    def by_username(username) = sql.get_first_row('SELECT * FROM customers WHERE username=?', [username])
    def taken?(username, email) = sql.get_first_value('SELECT 1 FROM customers WHERE username=? OR email=?', [username,email])
    def session(hash) = sql.get_first_row('SELECT c.* FROM customers c JOIN customer_sessions s ON s.customer_id=c.id WHERE s.token_hash=? AND s.expires_at>?', [hash,Axiom.now])
    def key(hash)
      row = sql.get_first_row('SELECT c.* FROM customers c JOIN customer_keys k ON k.customer_id=c.id WHERE k.key_hash=? AND k.revoked_at IS NULL AND k.deleted_at IS NULL', [hash])
      sql.execute('UPDATE customer_keys SET last_used_at=? WHERE key_hash=?', [Axiom.now,hash]) if row
      row
    end
    def session_create(id, token)
      sql.execute('INSERT INTO customer_sessions VALUES(?,?,?,?)', [Axiom.digest(token),id,Axiom.now,Axiom.now+604800000])
    end
    def logout(token) = sql.execute('DELETE FROM customer_sessions WHERE token_hash=?', [Axiom.digest(token)])
    def limit(scope, value, maximum, window)
      now=Axiom.now; id=Axiom.digest("#{scope}:#{value}")
      sql.execute('DELETE FROM auth_limits WHERE expires_at<=?', [now])
      raise Error.new(429,'Terlalu banyak permintaan. Coba lagi nanti.') if sql.get_first_value('SELECT COUNT(*) FROM auth_limits') >= 10000 && !sql.get_first_value('SELECT 1 FROM auth_limits WHERE id=?',[id])
      row=sql.get_first_row('INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<? RETURNING count',[id,now+window,maximum])
      raise Error.new(429,'Terlalu banyak percobaan. Coba lagi nanti.') unless row
    end
    def registration_create(r)
      sql.execute('INSERT INTO registrations(id,username,email,password_hash,password_salt,otp_hash,created_at,expires_at,sent_at,sending) VALUES(?,?,?,?,?,?,?,?,?,1)', r.values_at('id','username','email','password_hash','password_salt','otp_hash','created_at','expires_at','sent_at'))
    end
    def registration(id) = sql.get_first_row('SELECT * FROM registrations WHERE id=? AND expires_at>?', [id,Axiom.now])
    def registration_delete(id)
      transaction do
        sql.execute('DELETE FROM registrations WHERE id=?',[id])
        sql.execute('DELETE FROM registration_consents WHERE registration_id=?',[id])
      end
    end
    def registration_consent(id,version)
      PolicyStore.new(@db).registration(id,version)
    end
    def registration_delivered(id) = sql.execute('UPDATE registrations SET delivered=1,sending=0 WHERE id=?',[id])
    def claim_resend(id)
      sql.get_first_row('UPDATE registrations SET sending=1 WHERE id=? AND sending=0 AND delivered=1 AND attempts<5 AND expires_at>? AND sent_at<=? RETURNING *',[id,Axiom.now,Axiom.now-60000])
    end
    def resend_complete(id, hash)
      sql.execute('UPDATE registrations SET otp_hash=?,expires_at=?,sent_at=?,sending=0 WHERE id=? AND expires_at>?',[hash,Axiom.now+600000,Axiom.now,id,Axiom.now]); sql.changes == 1
    end
    def resend_release(id) = sql.execute('UPDATE registrations SET sending=0 WHERE id=?',[id])
    def attempt(id)
      sql.get_first_row('UPDATE registrations SET attempts=attempts+1 WHERE id=? AND expires_at>? AND delivered=1 AND sending=0 AND attempts<5 RETURNING *',[id,Axiom.now])
    end
    def activate(r, id, token)
      transaction do
        raise Error.new(409,'Nama pengguna atau email sudah terdaftar.') if taken?(r['username'],r['email'])
        sql.execute('DELETE FROM registrations WHERE id=? AND otp_hash=? AND expires_at>? AND attempts<=5 AND delivered=1 AND sending=0',[r['id'],r['otp_hash'],Axiom.now])
        raise Error.new(400,'Kode verifikasi tidak valid atau sudah kedaluwarsa.') unless sql.changes==1
        sql.execute('INSERT INTO customers(id,username,email,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)',[id,r['username'],r['email'],r['password_hash'],r['password_salt'],Axiom.now])
        PolicyStore.new(@db).activate(r['id'],id)
        sql.execute('DELETE FROM registrations WHERE username=? OR email=?',[r['username'],r['email']])
        session_create(id,token)
        customer(id)
      end
    end
    def keys(id) = sql.execute('SELECT id,name,prefix,created_at,last_used_at,revoked_at FROM customer_keys WHERE customer_id=? AND deleted_at IS NULL ORDER BY created_at DESC,id DESC',[id])
    def key_usage(id)
      row=sql.get_first_row('SELECT max_active_api_keys,(SELECT COUNT(*) FROM customer_keys WHERE customer_id=c.id AND revoked_at IS NULL AND deleted_at IS NULL) active FROM customers c WHERE id=?',[id])
      raise Error.new(404,'Pelanggan tidak ditemukan.') unless row
      {active:row['active'],limit:row['max_active_api_keys']}
    end
    def key_create(customer_id, name, secret)
      transaction do
        id=Axiom.token
        usage=key_usage(customer_id)
        raise Error.new(409,"Batas #{usage[:limit]} kunci API aktif telah tercapai.") if usage[:active]>=usage[:limit]
        sql.execute('INSERT INTO customer_keys(id,customer_id,name,key_hash,prefix,created_at) VALUES(?,?,?,?,?,?)',[id,customer_id,name,Axiom.digest(secret),secret[0,12],Axiom.now])
        ActionStore.new(@db).audit({'id'=>customer_id},'api-key.create',id,'success')
        OutboxStore.new(@db).enqueue(event_key:"security:key:#{id}:created",customer_id:customer_id,payload:{kind:'security',status:'API key dibuat',reference:id,message:'Kunci API baru dibuat. Secret tidak disertakan dalam pemberitahuan ini.'})
        keys(customer_id).find { |k| k['id']==id }
      end
    end
    def revoke(id, customer_id)
      transaction do
        row=sql.get_first_row('SELECT revoked_at FROM customer_keys WHERE id=? AND customer_id=? AND deleted_at IS NULL',[id,customer_id])
        raise Error.new(404,'Kunci API tidak ditemukan.') unless row
        next if row['revoked_at']
        sql.execute('UPDATE customer_keys SET revoked_at=? WHERE id=?',[Axiom.now,id])
        ActionStore.new(@db).audit({'id'=>customer_id},'api-key.revoke',id,'success')
        OutboxStore.new(@db).enqueue(event_key:"security:key:#{id}:revoked",customer_id:customer_id,payload:{kind:'security',status:'API key dicabut',reference:id,message:'Akses melalui kunci API ini telah dihentikan.'})
      end
    end
    def remove_key(id,customer_id)
      transaction do
        row=sql.get_first_row('SELECT revoked_at,deleted_at FROM customer_keys WHERE id=? AND customer_id=?',[id,customer_id])
        raise Error.new(404,'Kunci API tidak ditemukan.') unless row
        raise Error.new(409,'Cabut kunci API sebelum menghapusnya dari daftar.') unless row['revoked_at']
        next if row['deleted_at']
        sql.execute('UPDATE customer_keys SET deleted_at=? WHERE id=?',[Axiom.now,id])
        ActionStore.new(@db).audit({'id'=>customer_id},'api-key.remove',id,'success')
      end
    end
  end
end
