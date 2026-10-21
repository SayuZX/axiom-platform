# frozen_string_literal: true
require_relative './outbox_store'
module Axiom
  class PaymentStore
    def initialize(db)
      @db=db;@outbox=OutboxStore.new(db)
    end
    def sql = @db.connection
    def get(id) = sql.get_first_row('SELECT * FROM payments WHERE id=? OR trx_id=?',[id,id])
    def reserve(row,action_id:nil)
      @db.transaction do
        if action_id
          action=sql.get_first_row("SELECT a.* FROM secure_actions a LEFT JOIN telegram_links l ON l.customer_id=a.customer_id AND l.generation=a.generation WHERE a.id=? AND a.customer_id=? AND a.state='executing' AND a.resource_id IS NULL AND (a.generation IS NULL OR l.blocked=0)",[action_id,row['customer_id']])
          raise Error.new(409,'Otorisasi tindakan sudah tidak aktif.') unless action
        end
        sql.execute('INSERT INTO payments(id,trx_id,amount,qr,created_at,expires_at,customer_id,fee_rate_bps,fee_amount,fee_policy,notifications_enabled) VALUES(?,?,?,?,?,?,?,?,?,?,1)',row.values_at('id','trx_id','amount','qr','created_at','expires_at','customer_id','fee_rate_bps','fee_amount','fee_policy'))
        sql.execute('INSERT INTO payment_checks(payment_id,next_check_at) VALUES(?,?)',[row['id'],Axiom.now+30000])
        sql.execute('UPDATE secure_actions SET resource_id=? WHERE id=?',[row['id'],action_id]) if action_id
      end
      row
    end
    def apply(id, observed, status, expiry, qr, transaction)
      @db.transaction do
        current=get(id)
        next current if current['status']=='PAID'
        if current['provider_id'] && current['provider_id']!=observed['transaction_id']
          raise Error.new(502,'Identitas transaksi provider berubah saat verifikasi.')
        end
        if transaction
          existing=sql.get_first_value('SELECT payment_id FROM claims WHERE transaction_id=?',[observed['transaction_id']])
          raise Error.new(502,'Transaksi provider sudah dimiliki pembayaran lain.') if existing && existing!=id
          sql.execute('INSERT OR IGNORE INTO claims VALUES(?,?)',[observed['transaction_id'],id])
        end
        sql.execute('UPDATE payments SET status=?,provider_id=?,qr=?,expires_at=?,transaction_json=? WHERE id=?',[status,observed['transaction_id'],qr,expiry,transaction && JSON.generate(transaction),id])
        sql.execute('UPDATE payments SET provider_terminal=? WHERE id=?',[observed['status']=='pending' ? 0 : 1,id])
        updated=get(id)
        if updated['status']!='PAID' && updated['provider_terminal']==0
          sql.execute('INSERT OR IGNORE INTO payment_checks(payment_id,next_check_at) VALUES(?,?)',[id,Axiom.now+30000])
        end
        if updated['notifications_enabled']==1
          @outbox.payment(updated,'created') unless current['provider_id']
          @outbox.payment(updated,status) if status!=current['status'] && %w[PAID EXPIRED].include?(status)
        end
        updated
      end
    end
    def expire
      @db.transaction do
        sql.execute("SELECT * FROM payments WHERE status='PENDING' AND expires_at<? LIMIT 200",[Axiom.now]).each do |row|
          sql.execute("UPDATE payments SET status='EXPIRED' WHERE id=?",[row['id']])
          @outbox.payment(row.merge('status'=>'EXPIRED'),'EXPIRED') if row['notifications_enabled']==1 && row['provider_id']
        end
      end
    end
    def page(customer_id:,status:,search:,limit:,offset:)
      where='1=1'; args=[]
      if customer_id; where+=' AND customer_id=?';args<<customer_id;end
      if status!='all';where+=' AND status=?';args<<status;end
      if !search.empty?;where+=" AND (id LIKE ? ESCAPE '!' OR trx_id LIKE ? ESCAPE '!')";term='%'+search.gsub(/[!%_]/){|c|'!'+c}+'%';args.concat([term,term]);end
      total=sql.get_first_value("SELECT COUNT(*) FROM payments WHERE #{where}",args)
      rows=sql.execute("SELECT * FROM payments WHERE #{where} ORDER BY created_at DESC,id LIMIT ? OFFSET ?",args+[limit,offset])
      [rows,total]
    end
    def overview(customer_id)
      where=customer_id ? 'customer_id=?' : '1=1';args=customer_id ? [customer_id] : []
      totals=sql.get_first_row("SELECT COALESCE(SUM(CASE WHEN status='PAID' THEN amount ELSE 0 END),0) paid_amount,COALESCE(SUM(CASE WHEN status='PAID' THEN fee_amount ELSE 0 END),0) paid_fee_amount,COALESCE(SUM(CASE WHEN status='PAID' THEN amount-fee_amount ELSE 0 END),0) paid_net_amount,COALESCE(SUM(status='PAID'),0) paid_count,COALESCE(SUM(status='PENDING'),0) pending_count,COALESCE(SUM(status='EXPIRED'),0) expired_count,COUNT(*) total_count FROM payments WHERE #{where}",args)
      first=((Axiom.now+25200000)/86400000)*86400000-6*86400000
      rows=sql.execute("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch','+7 hours') date,SUM(amount) paid_amount,SUM(fee_amount) fee_amount,SUM(amount-fee_amount) net_amount,COUNT(*) count FROM payments WHERE #{where} AND status='PAID' AND created_at>=? AND created_at<? GROUP BY date",args+[first-25200000,first+7*86400000-25200000])
      days=7.times.map do |i|
        date=Time.at((first+i*86400000)/1000).utc.strftime('%Y-%m-%d')
        rows.find{|r|r['date']==date} || {'date'=>date,'paid_amount'=>0,'fee_amount'=>0,'net_amount'=>0,'count'=>0}
      end
      {totals:totals,charts:{timezone:'Asia/Jakarta',daily:days,status:%w[PAID PENDING EXPIRED].map{|s|{status:s,count:totals["#{s.downcase}_count"]}}}}
    end
    def transactions(customer_id,start_at,end_at,limit,offset)
      where="status='PAID' AND created_at BETWEEN ? AND ?";args=[start_at,end_at]
      if customer_id;where+=' AND customer_id=?';args<<customer_id;end
      [sql.execute("SELECT * FROM payments WHERE #{where} ORDER BY created_at DESC,id LIMIT ? OFFSET ?",args+[limit,offset]),sql.get_first_value("SELECT COUNT(*) FROM payments WHERE #{where}",args)]
    end
  end
end
