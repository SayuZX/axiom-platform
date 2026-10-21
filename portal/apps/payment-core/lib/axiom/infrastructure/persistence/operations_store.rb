# frozen_string_literal: true
module Axiom
  class OperationsStore
    def initialize(db)
      @db = db
    end

    # Read-only snapshot: queue counts cover all stored states; audit is newest 100.
    # accepted/sent/done are worker outcomes, not inbox delivery or service health.
    # generated_at lets the dashboard show the last successful report refresh.
    def report
      sql = @db.connection
      {
        generated_at: Axiom.iso(Axiom.now),
        email: sql.execute('SELECT state,COUNT(*) count FROM email_outbox GROUP BY state'),
        telegram: sql.execute('SELECT state,COUNT(*) count FROM telegram_deliveries GROUP BY state'),
        updates: sql.execute('SELECT state,COUNT(*) count FROM telegram_updates GROUP BY state'),
        pending_support: sql.get_first_value("SELECT COUNT(*) FROM support_tickets WHERE status IN ('OPEN','WAITING_ADMIN')"),
        audit: sql.execute('SELECT a.*,c.username FROM action_audit a LEFT JOIN customers c ON c.id=a.actor_customer_id ORDER BY a.id DESC LIMIT 100').map { |row| row.merge('created_at'=>Axiom.iso(row['created_at'])) }
      }
    end

    def report_rows(customer_id, from, to)
      @db.connection.execute("SELECT trx_id,amount,fee_amount,amount-fee_amount net_amount,status,created_at,expires_at FROM payments WHERE customer_id=? AND created_at>=? AND created_at<? ORDER BY created_at,id", [customer_id,from,to])
    end

    def report_totals(customer_id,from,to)
      @db.connection.get_first_row("SELECT COUNT(*) count,COALESCE(SUM(amount),0) gross_amount,COALESCE(SUM(fee_amount),0) fee_amount,COALESCE(SUM(amount-fee_amount),0) net_amount FROM payments WHERE customer_id=? AND created_at>=? AND created_at<? AND status='PAID'",[customer_id,from,to])
    end

    def request_payment_check(id)
      @db.connection.execute('INSERT INTO payment_checks(payment_id,next_check_at) VALUES(?,?) ON CONFLICT(payment_id) DO UPDATE SET next_check_at=MIN(next_check_at,excluded.next_check_at)',[id,Axiom.now])
    end

    def claim_payment_check
      @db.transaction do
        sql=@db.connection
        row=sql.get_first_row("SELECT p.* FROM payment_checks q JOIN payments p ON p.id=q.payment_id WHERE q.next_check_at<=? AND (q.lease_until IS NULL OR q.lease_until<=?) AND p.status<>'PAID' ORDER BY q.next_check_at LIMIT 1",[Axiom.now,Axiom.now])
        next nil unless row
        sql.execute('UPDATE payment_checks SET lease_until=?,next_check_at=? WHERE payment_id=?',[Axiom.now+60000,Axiom.now+30000,row['id']])
        row
      end
    end

    def finish_payment_check(id,verified:)
      row=@db.connection.get_first_row('SELECT status,provider_terminal FROM payments WHERE id=?',[id])
      if row && (!verified || row['provider_terminal']==0)
        @db.connection.execute('UPDATE payment_checks SET lease_until=NULL,next_check_at=? WHERE payment_id=?',[Axiom.now+(verified ? 30000 : 60000),id])
      else
        @db.connection.execute('DELETE FROM payment_checks WHERE payment_id=?',[id])
      end
    end
  end
end
