# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/application/receipts/receipts'
require_relative '../lib/axiom/infrastructure/persistence/outbox_store'
def rejected(status)
  begin;yield;rescue Axiom::Error=>e;raise unless e.status==status;return;end
  raise "Expected rejection #{status}"
end
Dir.mktmpdir('axiom-receipts-') do |dir|
  db=Axiom::Database.new(File.join(dir,'payments.sqlite'));db.migrate!
  sql=db.connection
  sql.execute("INSERT INTO customers(id,username,email,password_hash,password_salt,created_at) VALUES('alice','alice','alice@example.test','hash','salt',1)")
  tx=JSON.generate('confirmed_at'=>'2026-10-14T00:00:00Z','transaction_id'=>'provider-real-reference','amount'=>1)
  sql.execute("INSERT INTO payments(id,trx_id,amount,fee_amount,qr,created_at,expires_at,status,customer_id,transaction_json) VALUES('receipt-test','AXP-receipt',1,0,'000201',1,2,'PAID','alice',?)",[tx])
  receipts=Axiom::Receipts.new(db)
  user={'id'=>'alice','role'=>'customer'}
  rejected(401){receipts.document('payment','receipt-test',nil)}
  rejected(404){receipts.document('payment','receipt-test',{'id'=>'bob','role'=>'customer'})}
  rejected(404){receipts.document('unknown','receipt-test',user)}
  doc=receipts.document('payment','receipt-test',user)
  raise 'amount or WIB boundary' unless doc[:amount]=='Rp1' && doc[:rows].include?(['Neto pelanggan','Rp1']) && doc[:rows].include?(['Dikonfirmasi','14 Oktober 2026, 07:00:00 WIB'])
  raise 'recipient leaked' if JSON.generate(doc).include?('alice@example.test')
  receipts.document('payment','receipt-test',{'id'=>'admin','role'=>'admin'})
  sql.execute("UPDATE payments SET fee_amount=2500,amount=100000 WHERE id='receipt-test'")
  doc=receipts.document('payment','receipt-test',user)
  raise 'historical fee changed' unless doc[:rows].include?(['Komisi platform','Rp2.500']) && doc[:rows].include?(['Neto pelanggan','Rp97.500'])
  sql.execute("UPDATE payments SET status='PENDING' WHERE id='receipt-test'")
  rejected(409){receipts.document('payment','receipt-test',user)}
  sql.execute("UPDATE payments SET status='EXPIRED' WHERE id='receipt-test'")
  rejected(409){receipts.document('payment','receipt-test',user)}
  sql.execute("INSERT INTO withdrawals(id,customer_id,request_id,amount,bank_name,account_number,account_holder,status,requested_at,updated_at,estimated_start_at,estimated_end_at,processed_at,completed_at,transfer_reference) VALUES('withdrawal-test','alice','receipt-request-01',9007199254740991,'Bank A','0012345678','Alice Example','PAID',1,1791936000000,86400001,172800001,2,1791936000000,'REAL-TRANSFER')")
  doc=receipts.document('withdrawal','withdrawal-test',user)
  raise 'withdrawal amount or masking' unless doc[:amount]=='Rp9.007.199.254.740.991' && doc[:rows].include?(['Rekening tujuan','****5678']) && doc[:rows].include?(['Penerima','A*** E***'])
  rejected(404){receipts.document('withdrawal','withdrawal-test',{'id'=>'bob','role'=>'customer'})}
  sql.execute("INSERT INTO withdrawals(id,customer_id,request_id,amount,bank_name,account_number,account_holder,status,requested_at,updated_at,estimated_start_at,estimated_end_at) VALUES('withdrawal-state-test','alice','receipt-request-02',1,'Bank A','0012345678','Alice Example','REQUESTED',1,1,86400001,172800001)")
  rejected(409){receipts.document('withdrawal','withdrawal-state-test',user)}
  sql.execute("UPDATE withdrawals SET status='PROCESSING',processed_at=2,updated_at=2 WHERE id='withdrawal-state-test'")
  rejected(409){receipts.document('withdrawal','withdrawal-state-test',user)}
  sql.execute("UPDATE withdrawals SET status='REJECTED',rejected_at=3,updated_at=3,rejection_reason='Fixture rejection' WHERE id='withdrawal-state-test'")
  rejected(409){receipts.document('withdrawal','withdrawal-state-test',user)}
  sql.execute("INSERT INTO telegram_links(customer_id,user_id,chat_id,generation,created_at) VALUES('alice','123','123','generation',1)")
  sql.execute("INSERT INTO notification_preferences(customer_id,telegram_enabled) VALUES('alice',1)")
  outbox=Axiom::OutboxStore.new(db)
  payment=sql.get_first_row("SELECT * FROM payments WHERE id='receipt-test'").merge('status'=>'PAID')
  2.times{outbox.payment(payment,'PAID')}
  rows=sql.execute("SELECT * FROM telegram_deliveries WHERE event_key='payment:receipt-test:PAID'")
  raise 'duplicate receipt delivery' unless rows.length==1
  raise 'receipt attachment missing' unless rows[0]['method']=='sendPhoto' && JSON.parse(rows[0]['payload_json']).dig('receipt','id')=='receipt-test'
  outbox.payment(payment,'created')
  row=sql.get_first_row("SELECT * FROM telegram_deliveries WHERE event_key='payment:receipt-test:created'")
  raise 'duplicate created image' unless row['method']=='sendMessage'
ensure
  db&.close
end
puts 'PASS: receipt ownership, admin, state, historical fees, Rp1 and WIB boundaries'
