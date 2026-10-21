# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/application/withdrawals/withdrawals'

def rejects(status)
  yield
  raise 'invalid destination accepted'
rescue Axiom::Error=>e
  raise unless e.status==status
end
catalog=Axiom::WithdrawalDestinations
raise 'duplicate destinations' unless catalog::GROUPS.flat_map{|g|g[:names]}.uniq.length==catalog::GROUPS.sum{|g|g[:names].length}
%w[DANA GoPay OVO ShopeePay LinkAja i.saku].each do |name|
  %w[0812345678 0812345678901 62812345678 62812345678901].each{|number|catalog.validate!(name,number)}
  %w[081234567 08123456789012 +62812345678 0212345678 62801234567].each{|number|rejects(400){catalog.validate!(name,number)}}
end
catalog.validate!('BCA','000001')
catalog.validate!('BCA','1'*34)
['1'*5,'1'*35,'１２３４５６',nil].each{|number|rejects(400){catalog.validate!('BCA',number)}}
rejects(400){catalog.validate!('Bank Tidak Terdaftar','0012345678')}
Dir.mktmpdir('axiom-destinations-') do |dir|
  db=Axiom::Database.new(File.join(dir,'payments.sqlite'));db.migrate!
  db.connection.execute("INSERT INTO customers(id,username,email,password_hash,password_salt,created_at) VALUES('alice','alice','alice@example.test','hash','salt',1)")
  service=Axiom::Withdrawals.new(db)
  body={'amount'=>10000,'bank_name'=>'Bank Lama','account_number'=>'0012345678','account_holder'=>'Alice','request_id'=>'historical-request-0001','expected_customer_id'=>'alice'}
  db.connection.execute("INSERT INTO payments(id,trx_id,amount,qr,created_at,expires_at,status,customer_id,fee_amount) VALUES('catalog-paid','AXP-catalog-paid',10000,'000201',1,2,'PAID','alice',0)")
  # Historical persisted destinations bypass only the new catalog rule on an exact retry.
  row=service.store.insert('alice',body)
  code,data=service.create(customer_id:'alice',body:body)
  raise 'historical retry changed' unless code==200 && data[:withdrawal]['id']==row['id']
  raise 'historical read changed' unless service.detail(row['id'],customer_id:'alice')[:withdrawal]['bank_name']=='Bank Lama'
  rejects(409){service.create(customer_id:'alice',body:body.merge('bank_name'=>'BCA'))}
  rejects(400){service.create(customer_id:'alice',body:body.merge('request_id'=>'new-request-00000001'))}
  rejects(400){service.create(customer_id:'alice',body:body.merge('request_id'=>'new-request-00000002','bank_name'=>'DANA','account_number'=>'0212345678'))}
  rejects(409){service.create(customer_id:'alice',body:body.merge('request_id'=>'new-request-00000003','bank_name'=>'BCA'))}
ensure
  db&.close
end
puts 'PASS: destination catalog, wallet phone boundaries, historical reads/retries, request conflict, balance guard'
