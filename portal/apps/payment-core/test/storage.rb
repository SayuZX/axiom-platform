# frozen_string_literal: true
require 'tmpdir'
require 'sqlite3'
require_relative '../lib/axiom/infrastructure/persistence/database'

def assert(value, message)
  raise message unless value
end

Dir.mktmpdir('axiom-storage-') do |dir|
  path = File.join(dir, 'payments.sqlite')
  old = SQLite3::Database.new(path)
  old.execute_batch(<<~SQL)
    CREATE TABLE payments(id TEXT PRIMARY KEY,trx_id TEXT UNIQUE,amount INTEGER,qr TEXT,created_at INTEGER,expires_at INTEGER,status TEXT,transaction_json TEXT,customer_id TEXT,provider_id TEXT,fee_rate_bps INTEGER NOT NULL DEFAULT 0,fee_amount INTEGER NOT NULL DEFAULT 0);
    INSERT INTO payments VALUES('legacy','AXP-legacy',100000,'000201',1,900001,'PAID','{}','owner','provider',100,1000);
  SQL
  old.close
  db = Axiom::Database.new(path)
  db.migrate!
  db.connection.execute("INSERT INTO payments(id,trx_id,amount,qr,created_at,expires_at,status,transaction_json,customer_id,provider_id,fee_rate_bps,fee_amount,fee_policy) VALUES('fixed','AXP-fixed',100000,'000201',1,900001,'PAID','{}','owner','provider-fixed',0,2500,'fixed_2500')")
  2.times { db.migrate! }
  row = db.connection.get_first_row("SELECT * FROM payments WHERE id='legacy'")
  assert(row.values_at('amount','fee_amount','fee_rate_bps','fee_policy') == [100000,1000,100,'percentage_100bps'], 'migration changed historical money')
  fixed = db.connection.get_first_row("SELECT * FROM payments WHERE id='fixed'")
  assert(fixed.values_at('amount','fee_amount','fee_rate_bps','fee_policy') == [100000,2500,0,'fixed_2500'], 'migration changed historical fixed fee')
  begin
    db.transaction do
      db.connection.execute("INSERT INTO auth_limits VALUES('rollback',1,1)")
      raise 'abort'
    end
  rescue RuntimeError => e
    raise unless e.message == 'abort'
  end
  assert(db.connection.get_first_value("SELECT COUNT(*) FROM auth_limits WHERE id='rollback'") == 0, 'partial transaction committed')
  assert(db.connection.get_first_value('SELECT COUNT(*) FROM email_outbox') == 0, 'migration notified historical invoices')
  db.close
end
puts 'PASS: historical fee migration, rollback, no historical email'
