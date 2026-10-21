# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/application/payments/payments'
require_relative '../lib/axiom/infrastructure/persistence/operations_store'
Dir.mktmpdir do |dir|
  db=Axiom::Database.new(File.join(dir,'payments.sqlite'));db.migrate!
  service=Axiom::Payments.new(db,nil);store=service.store
  row={'id'=>'reconciliation-test','trx_id'=>'AXP-test','amount'=>25511,'qr'=>'','created_at'=>Axiom.now-120000,'expires_at'=>Axiom.now-60000,'customer_id'=>nil,'fee_rate_bps'=>200,'fee_amount'=>510,'fee_policy'=>'percentage_200bps'}
  store.reserve(row)
  raise 'uncertain creation lost' unless db.connection.get_first_value('SELECT COUNT(*) FROM payment_checks')==1
  db.connection.execute('DELETE FROM payment_checks')
  observed={'transaction_id'=>'provider-test','order_id'=>'AXP-test','amount'=>25511,'currency'=>'IDR','status'=>'pending','expires_at'=>Axiom.iso(row['expires_at']),'qr_string'=>'000201test'}
  service.apply(store.get(row['id']),observed)
  raise 'expired pending provider lost' unless db.connection.get_first_value('SELECT COUNT(*) FROM payment_checks')==1
  service.apply(store.get(row['id']),observed.merge('status'=>'settlement'))
  service.apply(store.get(row['id']),observed.merge('status'=>'settlement'))
  paid=store.get(row['id'])
  raise 'settlement not recovered' unless paid['status']=='PAID' && paid['fee_amount']==510
  raise 'duplicate settlement claim' unless db.connection.get_first_value('SELECT COUNT(*) FROM claims')==1
  Axiom::OperationsStore.new(db).finish_payment_check(row['id'],verified:true)
  raise 'terminal check retained' unless db.connection.get_first_value('SELECT COUNT(*) FROM payment_checks')==0
  db.close
end
puts 'PASS: uncertain creation queued; expired pending reconciled; settlement recovered once with original fees'
