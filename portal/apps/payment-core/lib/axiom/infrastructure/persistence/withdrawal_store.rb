# frozen_string_literal: true
require_relative './outbox_store'
module Axiom
  class WithdrawalStore
    def initialize(db)
      @db=db;@outbox=OutboxStore.new(db)
    end
    def sql = @db.connection
    def transaction(&block) = @db.transaction(&block)
    def get(id) = sql.get_first_row('SELECT * FROM withdrawals WHERE id=?',[id])
    def safe(value)
      raise Error.new(503,'Saldo belum dapat dipastikan. Penarikan tidak diproses.') unless value.is_a?(Integer) && value.between?(0,9007199254740991)
      value
    end
    def wallet(id)
      row=sql.get_first_row(<<~SQL,[id,id])
        SELECT p.*,w.* FROM (
          SELECT COALESCE(SUM(amount-fee_amount),0) earned_amount,
          COALESCE(SUM(CASE WHEN typeof(amount)<>'integer' OR amount<1 OR amount>9007199254740991 OR typeof(fee_amount)<>'integer' OR fee_amount<0 OR fee_amount>amount THEN 1 ELSE 0 END),0) invalid_count
          FROM payments WHERE customer_id=? AND status='PAID'
        ) p CROSS JOIN (
          SELECT COALESCE(SUM(CASE WHEN status='REQUESTED' THEN amount ELSE 0 END),0) requested_amount,
          COALESCE(SUM(CASE WHEN status='PROCESSING' THEN amount ELSE 0 END),0) processing_amount,
          COALESCE(SUM(CASE WHEN status='PAID' THEN amount ELSE 0 END),0) paid_out_amount FROM withdrawals WHERE customer_id=?
        ) w
      SQL
      raise Error.new(503,'Saldo belum dapat dipastikan. Penarikan tidak diproses.') if row.delete('invalid_count')!=0
      row.each_value{|v|safe(v)};row['reserved_amount']=safe(row['requested_amount']+row['processing_amount']);row['available_amount']=safe(row['earned_amount']-row['reserved_amount']-row['paid_out_amount']);row
    rescue SQLite3::Exception
      raise Error.new(503,'Saldo belum dapat dipastikan. Penarikan tidak diproses.')
    end
    def previous(customer_id,request_id) = sql.get_first_row('SELECT * FROM withdrawals WHERE customer_id=? AND request_id=?',[customer_id,request_id])
    def insert(customer_id,body)
      now=Axiom.now;id=SecureRandom.uuid
      sql.execute("INSERT INTO withdrawals(id,customer_id,request_id,amount,bank_name,account_number,account_holder,status,requested_at,updated_at,estimated_start_at,estimated_end_at) VALUES(?,?,?,?,?,?,?,'REQUESTED',?,?,?,?)",[id,customer_id,body['request_id'],body['amount'],body['bank_name'],body['account_number'],body['account_holder'],now,now,now+86400000,now+172800000])
      row=get(id);audit(row,customer_id,nil);row
    end
    def audit(row,actor,from)
      sql.execute('INSERT INTO withdrawal_events(withdrawal_id,actor_customer_id,from_status,to_status,created_at,transfer_reference,rejection_reason) VALUES(?,?,?,?,?,?,?)',[row['id'],actor,from,row['status'],row['updated_at'],row['transfer_reference'],row['rejection_reason']])
      @outbox.withdrawal(row)
    end
    def update(row,actor,status,reference,reason)
      if reference && sql.get_first_value('SELECT 1 FROM withdrawals WHERE transfer_reference=?',[reference]);raise Error.new(409,'Referensi transfer sudah digunakan untuk penarikan lain.');end
      now=[Axiom.now,row['updated_at']].max
      sql.execute('UPDATE withdrawals SET status=?,updated_at=?,processed_at=?,completed_at=?,rejected_at=?,transfer_reference=?,rejection_reason=? WHERE id=?',[status,now,status=='PROCESSING' ? now : row['processed_at'],status=='PAID' ? now : nil,status=='REJECTED' ? now : nil,reference,reason,row['id']])
      updated=get(row['id']);audit(updated,actor,row['status']);updated
    end
    def page(customer_id:,status:,limit:,offset:)
      where='1=1';args=[]
      if customer_id;where+=' AND customer_id=?';args<<customer_id;end
      if status!='all';where+=' AND status=?';args<<status;end
      [sql.execute("SELECT * FROM withdrawals WHERE #{where} ORDER BY requested_at DESC,id DESC LIMIT ? OFFSET ?",args+[limit,offset]),sql.get_first_value("SELECT COUNT(*) FROM withdrawals WHERE #{where}",args)]
    end
    def events(id) = sql.execute('SELECT id,from_status,to_status,created_at,transfer_reference,rejection_reason FROM withdrawal_events WHERE withdrawal_id=? ORDER BY id',[id])
  end
end
