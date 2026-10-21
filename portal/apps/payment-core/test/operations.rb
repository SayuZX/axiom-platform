# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require 'time'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/infrastructure/persistence/operations_store'

Dir.mktmpdir('axiom-operations-') do |dir|
  db=Axiom::Database.new(File.join(dir,'payments.sqlite'));db.migrate!
  store=Axiom::OperationsStore.new(db)
  started=Time.now.utc
  report=store.report
  raise 'missing report timestamp' unless Time.iso8601(report[:generated_at]) >= started-1
  %i[email telegram updates audit].each { |key| raise "nonempty #{key}" unless report[key].empty? }
  raise 'incorrect support count' unless report[:pending_support]==0
  db.connection.execute('INSERT INTO customers(id,username,email,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)',['operator','operator','operator@example.test','hash','salt',Axiom.now])
  102.times do |i|
    db.connection.execute('INSERT INTO action_audit(actor_customer_id,channel,action,resource_id,result,created_at) VALUES(?,?,?,?,?,?)',['operator',i.even? ? 'web' : 'telegram','withdrawal.status',"withdrawal-#{i}",i.even? ? 'success' : 'rejected:409',Axiom.now])
  end
  rows=store.report[:audit]
  raise 'audit limit lost' unless rows.size==100
  raise 'audit order lost' unless rows.first['resource_id']=='withdrawal-101' && rows.last['resource_id']=='withdrawal-2'
  raise 'audit actor lost' unless rows.all? { |row| row['username']=='operator' }
  raise 'audit time missing' unless Time.iso8601(rows.first['created_at'])
  db.close
end
puts 'PASS: operations report timestamp, empty queues, support count, audit limit/order/actor/time'
