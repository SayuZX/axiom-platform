# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/infrastructure/persistence/action_store'
require_relative '../lib/axiom/infrastructure/persistence/operations_store'
require_relative '../lib/axiom/application/ledger/reports'
require_relative '../lib/axiom/application/payments/payments'
Dir.mktmpdir('axiom-edges-') do |dir|
  db=Axiom::Database.new(File.join(dir,'payments.sqlite'));db.migrate!
  db.connection.execute("INSERT INTO customers(id,username,email,password_hash,password_salt,created_at) VALUES('alice','alice','alice@example.test','hash','salt',1)")
  actions=Axiom::ActionStore.new(db)
  action=actions.draft('alice','withdrawal',{'amount'=>1})
  actions.claim(action,'alice')
  db.connection.execute('UPDATE secure_actions SET expires_at=0 WHERE id=?',[action])
  begin
    actions.get(action,'alice');raise 'executing-but-unreserved action escaped expiry'
  rescue Axiom::Error=>e
    raise unless e.status==409
  end
  recoverable=actions.draft('alice','payment',{'amount'=>100000})
  actions.claim(recoverable,'alice')
  db.connection.execute('UPDATE secure_actions SET claimed_at=0 WHERE id=?',[recoverable])
  raise 'interrupted unreserved draft stuck' unless actions.claim(recoverable,'alice')['state']=='claimed'
  first=actions.request_account('alice',{'bank_name'=>'Bank A','account_number'=>'0012345678','account_holder'=>'Alice'})
  actions.request_account('alice',{'bank_name'=>'Bank B','account_number'=>'0098765432','account_holder'=>'Alice'})
  begin
    actions.verify_account('alice','admin',first['revision']);raise 'stale approval verified replacement bank'
  rescue Axiom::Error=>e
    raise unless e.status==409
  end
  db.connection.execute("INSERT INTO payments(id,trx_id,amount,qr,created_at,expires_at,status,customer_id) VALUES('expired-test','AXP-expired',100000,'000201',1,2,'EXPIRED','alice')")
  checks=Axiom::OperationsStore.new(db);checks.request_payment_check('expired-test')
  checks.finish_payment_check('expired-test',verified:false)
  raise 'failed provider verification dropped reconciliation' unless db.connection.get_first_value("SELECT COUNT(*) FROM payment_checks WHERE payment_id='expired-test'")==1
  db.connection.execute("UPDATE payments SET provider_terminal=1 WHERE id='expired-test'")
  checks.finish_payment_check('expired-test',verified:true)
  raise 'provider terminal check not cleared' unless db.connection.get_first_value('SELECT COUNT(*) FROM payment_checks')==0
  report_insert=db.connection.prepare('INSERT INTO payments(id,trx_id,amount,fee_amount,qr,created_at,expires_at,status,customer_id) VALUES(?,?,?,?,?,?,?,?,?)')
  [['before',Time.iso8601('2026-10-09T16:59:59Z').to_i*1000,'alice',10000,2500],['inside',Time.iso8601('2026-10-09T17:00:00Z').to_i*1000,'alice',100000,2500],['other',Time.iso8601('2026-10-09T17:00:00Z').to_i*1000,'bob',500000,2500]].each do |id,created,owner,amount,fee|
    report_insert.execute([id,"AXP-#{id}",amount,fee,'000201',created,created+900000,'PAID',owner])
  end
  report_insert.close
  totals=Axiom::Reports.new(db).read('alice','daily','2026-10-10')[:totals]
  raise 'report crossed WIB day or account boundary' unless totals.values_at('count','gross_amount','fee_amount','net_amount')==[1,100000,2500,97500]
  payments=Axiom::Payments.new(db,nil)
  row={'id'=>'utc-expiry-test','trx_id'=>'AXP-utc-expiry','amount'=>1,'qr'=>'000201','created_at'=>Axiom.now,'expires_at'=>Axiom.now+900000,'customer_id'=>'alice','fee_rate_bps'=>200,'fee_amount'=>0,'fee_policy'=>'percentage_200bps'}
  payments.store.reserve(row)
  expiry=Time.now.utc.to_i+900
  observed={'order_id'=>row['trx_id'],'currency'=>'IDR','amount'=>1,'transaction_id'=>'utc-provider','status'=>'pending','qr_string'=>'000201','expires_at'=>Time.at(expiry).utc.strftime('%Y-%m-%d %H:%M:%S')}
  result=payments.apply(row,observed)
  raise 'fresh provider QRIS expired or shifted timezone' unless result['status']=='PENDING' && result['expires_at']==expiry*1000
  observed['expires_at']=Time.at(expiry).getlocal('+07:00').iso8601
  raise 'explicit provider timezone changed' unless payments.apply(result,observed)['expires_at']==expiry*1000
ensure
  db&.close
end
puts 'PASS: expired action rejection, snapshot-bound bank approval, failed expiry reconciliation retained, verified terminal cleared'
