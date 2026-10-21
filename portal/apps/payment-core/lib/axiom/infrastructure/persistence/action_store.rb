# frozen_string_literal: true
require_relative 'outbox_store'
module Axiom
  class ActionStore
    def initialize(db) = @db=db
    def sql = @db.connection
    def transaction(&block) = @db.transaction(&block)
    def draft(customer_id,kind,payload,generation=nil)
      id=Axiom.token;sql.execute('INSERT INTO secure_actions(id,customer_id,generation,kind,payload_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?)',[id,customer_id,generation,kind,JSON.generate(payload),Axiom.now+900000,Axiom.now]);id
    end
    def get(id,customer_id)
      row=sql.get_first_row('SELECT * FROM secure_actions WHERE id=? AND customer_id=?',[id,customer_id])
      raise Error.new(404,'Tindakan tidak ditemukan.') unless row
      if row['generation']
        link=sql.get_first_value('SELECT 1 FROM telegram_links WHERE customer_id=? AND generation=? AND blocked=0',[customer_id,row['generation']]);raise Error.new(409,'Tautan Telegram sudah tidak aktif.') unless link
      end
      raise Error.new(409,'Tindakan sudah dibatalkan atau kedaluwarsa.') if row['state']=='cancelled' || (row['state']!='done' && row['resource_id'].nil? && row['expires_at']<Axiom.now)
      row.merge('payload'=>JSON.parse(row['payload_json']))
    end
    def claim(id,customer_id)
      @db.transaction do
        row=get(id,customer_id)
        if row['state']=='pending' || (row['state']=='executing' && row['resource_id'].nil? && row['claimed_at'].to_i+60000<Axiom.now)
          sql.execute("UPDATE secure_actions SET state='executing',claimed_at=? WHERE id=?",[Axiom.now,id]);row['state']='claimed'
        end
        row
      end
    end
    def release_unreserved(id)
      sql.execute("UPDATE secure_actions SET state='pending' WHERE id=? AND state='executing' AND resource_id IS NULL",[id])
    end
    def finish(id,resource_id) = sql.execute("UPDATE secure_actions SET state='done',resource_id=? WHERE id=?",[resource_id,id])
    def audit(user,action,resource,result,channel='web',telegram_user_id=nil)
      sql.execute('INSERT INTO action_audit(actor_customer_id,telegram_user_id,channel,action,resource_id,result,created_at) VALUES(?,?,?,?,?,?,?)',[user['id'],telegram_user_id,channel,action,resource,result,Axiom.now])
    end
    def account(customer_id) = sql.get_first_row('SELECT * FROM verified_accounts WHERE customer_id=?',[customer_id])
    def request_account(customer_id,body)
      transaction do
        sql.execute("INSERT INTO verified_accounts(customer_id,bank_name,account_number,account_holder,status,updated_at,revision) VALUES(?,?,?,?,'PENDING',?,?) ON CONFLICT(customer_id) DO UPDATE SET bank_name=excluded.bank_name,account_number=excluded.account_number,account_holder=excluded.account_holder,status='PENDING',updated_at=excluded.updated_at,revision=excluded.revision,verified_by=NULL,verified_at=NULL",[customer_id,body['bank_name'],body['account_number'],body['account_holder'],Axiom.now,Axiom.token])
        OutboxStore.new(@db).enqueue(event_key:"security:bank:#{Axiom.token}",customer_id:customer_id,payload:{kind:'security',status:'Rekening diajukan ulang',reference:customer_id,message:'Rekening tujuan diubah dan menunggu verifikasi admin. Periksa akun bila perubahan bukan oleh Anda.'})
        account(customer_id)
      end
    end
    def verify_account(customer_id,actor,revision)
      raise Error.new(400,'Revisi rekening yang diperiksa diperlukan.') unless revision.is_a?(String) && !revision.empty?
      sql.execute("UPDATE verified_accounts SET status='VERIFIED',verified_by=?,verified_at=? WHERE customer_id=? AND revision=? AND status='PENDING'",[actor,Axiom.now,customer_id,revision])
      raise Error.new(409,'Rekening sudah berubah. Periksa ulang sebelum menyetujui.') unless sql.changes==1
    end
  end
end
