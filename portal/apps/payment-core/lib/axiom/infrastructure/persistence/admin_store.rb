# frozen_string_literal: true
require_relative './withdrawal_store'
require_relative './action_store'
module Axiom
  class AdminStore
    def initialize(db)
      @db=db;@wallets=WithdrawalStore.new(db)
    end
    def sql = @db.connection
    def totals(customer_id=nil)
      where=customer_id ? ' AND customer_id=?' : '';args=customer_id ? [customer_id] : []
      row=sql.get_first_row("SELECT COUNT(*) paid_count,COALESCE(SUM(amount),0) gross_amount,COALESCE(SUM(fee_amount),0) fee_amount,COALESCE(SUM(amount-fee_amount),0) net_amount FROM payments WHERE status='PAID'#{where}",args)
      row.each_value{|v|@wallets.safe(v)};row
    end
    def overview
      totals.merge(sql.get_first_row("SELECT COUNT(CASE WHEN status='REQUESTED' THEN 1 END) requested_count,COALESCE(SUM(CASE WHEN status='REQUESTED' THEN amount ELSE 0 END),0) requested_amount,COUNT(CASE WHEN status='PROCESSING' THEN 1 END) processing_count,COALESCE(SUM(CASE WHEN status='PROCESSING' THEN amount ELSE 0 END),0) processing_amount,COALESCE(SUM(CASE WHEN status='PAID' THEN amount ELSE 0 END),0) paid_out_amount FROM withdrawals")).merge('customer_count'=>sql.get_first_value('SELECT COUNT(*) FROM customers'))
    end
    def customer(id)
      row=sql.get_first_row('SELECT id,username,email,role,created_at,max_active_api_keys,(SELECT COUNT(*) FROM customer_keys WHERE customer_id=customers.id AND revoked_at IS NULL AND deleted_at IS NULL) active_api_keys FROM customers WHERE id=?',[id])
      raise Error.new(404,'Pelanggan tidak ditemukan.') unless row
      row.merge('created_at'=>Axiom.iso(row['created_at']),'wallet'=>@wallets.wallet(id),'totals'=>totals(id),'bank_account'=>sql.get_first_row('SELECT bank_name,account_number,account_holder,status,revision FROM verified_accounts WHERE customer_id=?',[id]))
    end
    def key_limit(id,value,actor_id)
      raise Error.new(400,'Batas kunci aktif harus bilangan bulat 0–100.') unless value.is_a?(Integer) && value.between?(0,100)
      @db.transaction do
        raise Error.new(403,'Akses administrator diperlukan.') unless sql.get_first_value('SELECT role FROM customers WHERE id=?',[actor_id])=='admin'
        sql.execute('UPDATE customers SET max_active_api_keys=? WHERE id=?',[value,id])
        raise Error.new(404,'Pelanggan tidak ditemukan.') unless sql.changes==1
        ActionStore.new(@db).audit({'id'=>actor_id},'api-key.limit',id,"limit:#{value}")
        customer(id)
      end
    end
    def customers(search,limit,offset)
      term='%'+search.gsub(/[!%_]/){|c|'!'+c}+'%';where="username LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!' OR id LIKE ? ESCAPE '!'";args=[term,term,term]
      rows=sql.execute("SELECT id,username,email,role,created_at FROM customers WHERE #{where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",args+[limit,offset])
      [rows.map{|r|w=@wallets.wallet(r['id']);r.merge('created_at'=>Axiom.iso(r['created_at'])).merge(totals(r['id'])).merge(w.slice('available_amount','reserved_amount','paid_out_amount'))},sql.get_first_value("SELECT COUNT(*) FROM customers WHERE #{where}",args)]
    end
    def payments(status,search,customer_id,limit,offset)
      where="(?='all' OR p.status=?) AND (p.id LIKE ? ESCAPE '!' OR p.trx_id LIKE ? ESCAPE '!' OR c.username LIKE ? ESCAPE '!' OR p.customer_id LIKE ? ESCAPE '!')";term='%'+search.gsub(/[!%_]/){|c|'!'+c}+'%';args=[status,status,term,term,term,term]
      if customer_id;where+=' AND p.customer_id=?';args<<customer_id;end
      rows=sql.execute("SELECT p.*,c.username FROM payments p LEFT JOIN customers c ON c.id=p.customer_id WHERE #{where} ORDER BY p.created_at DESC,p.id DESC LIMIT ? OFFSET ?",args+[limit,offset])
      [rows,sql.get_first_value("SELECT COUNT(*) FROM payments p LEFT JOIN customers c ON c.id=p.customer_id WHERE #{where}",args)]
    end
    def withdrawals(status,customer_id,limit,offset)
      where="(?='all' OR w.status=?)";args=[status,status]
      if customer_id;where+=' AND w.customer_id=?';args<<customer_id;end
      rows=sql.execute("SELECT w.*,c.username,c.email FROM withdrawals w JOIN customers c ON c.id=w.customer_id WHERE #{where} ORDER BY w.requested_at DESC,w.id DESC LIMIT ? OFFSET ?",args+[limit,offset])
      [rows,sql.get_first_value("SELECT COUNT(*) FROM withdrawals w WHERE #{where}",args)]
    end
    def audit(limit,offset)
      [sql.execute('SELECT e.*,c.username actor_username FROM withdrawal_events e LEFT JOIN customers c ON c.id=e.actor_customer_id ORDER BY e.id DESC LIMIT ? OFFSET ?',[limit,offset]),sql.get_first_value('SELECT COUNT(*) FROM withdrawal_events')]
    end
    def commissions
      {'totals'=>totals,'policies'=>sql.execute("SELECT fee_policy,COUNT(*) paid_count,SUM(amount) gross_amount,SUM(fee_amount) fee_amount,SUM(amount-fee_amount) net_amount FROM payments WHERE status='PAID' GROUP BY fee_policy")}
    end
  end
end
