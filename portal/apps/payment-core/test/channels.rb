# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/application/identity/telegram_identity'
require_relative '../lib/axiom/application/identity/secure_actions'
Dir.mktmpdir('axiom-channels') do |dir|
  db=Axiom::Database.new(File.join(dir,'payments.sqlite'));db.migrate!
  %w[alice bob].each{|id|db.connection.execute('INSERT INTO customers(id,username,email,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)',[id,id,"#{id}@example.test",'hash','salt',Axiom.now])}
  service=Axiom::TelegramIdentity.new(db,'axiom_test_bot')
  start=service.start('alice');token=URI(start[:url]).query.split('=').last
  service.store.ingest({'update_id'=>1,'message'=>{'from'=>{'id'=>101},'chat'=>{'id'=>101,'type'=>'private'},'text'=>"/start #{token}"}})
  stored=db.connection.get_first_value('SELECT payload_json FROM telegram_updates WHERE update_id=1')
  raise 'link token persisted in plaintext' if stored.include?(token)
  raise 'link claim hash missing' unless JSON.parse(stored)['_link_token_hash']==Axiom.digest(token)
  service.claim(token,'101','101','Alice Telegram')
  raise 'link activated before web confirmation' if service.current('alice')[:link]
  begin
    service.confirm('bob','101');raise 'cross-account link succeeded'
  rescue Axiom::Error=>e
    raise unless e.status==409
  end
  service.confirm('alice','101')
  raise 'identity mismatch' unless service.current('alice')[:link]['user_id']=='101'
  begin
    service.claim(token,'202','202','Forwarded');raise 'forwarded token reused'
  rescue Axiom::Error=>e
    raise unless e.status==400
  end
  callback=service.callback('alice','balance',nil)
  raise 'callback owner bypass' if service.consume_callback(callback,'202')
  raise 'callback unavailable' unless service.consume_callback(callback,'101')
  raise 'callback replay' if service.consume_callback(callback,'101')
  password='Channel-password-12345';salt='0123456789abcdef0123456789abcdef'
  hash=OpenSSL::KDF.scrypt(password,salt:salt,N:32768,r:8,p:1,length:64).unpack1('H*')
  db.connection.execute("UPDATE customers SET password_hash=?,password_salt=? WHERE id='alice'",[hash,salt])
  db.connection.execute("INSERT INTO payments(id,trx_id,amount,qr,created_at,expires_at,status,customer_id,fee_amount) VALUES('channel-paid','AXP-channel-paid',100000,'000201',1,2,'PAID','alice',2500)")
  config=Axiom::Config.new({'PUBLIC_URL'=>'http://127.0.0.1:3084','DATA_DIR'=>dir,'API_KEY'=>'test-secret-key-long-enough-not-production'})
  actions=Axiom::SecureActions.new(db,config);user={'id'=>'alice','role'=>'customer'}
  destination={'bank_name'=>'BCA','account_number'=>'0012345678','account_holder'=>'Alice Test'}
  account=actions.store.request_account('alice',destination);actions.store.verify_account('alice','bob',account['revision'])
  generation=service.store.link('alice')['generation']
  action_id=actions.store.draft('alice','withdrawal',destination.merge('amount'=>10000),generation)
  first=actions.confirm(user,action_id,password);second=actions.confirm(user,action_id,password)
  raise 'confirmation created duplicate withdrawal' unless first[:resource_id]==second[:resource_id] && db.connection.get_first_value('SELECT COUNT(*) FROM withdrawals')==1
  raise 'confirmation reserved money twice' unless Axiom::WithdrawalStore.new(db).wallet('alice')['available_amount']==87500
  raise 'confirmed action response not queued' unless db.connection.get_first_value('SELECT COUNT(*) FROM telegram_deliveries WHERE event_key=?',["action-result:#{action_id}"])==1
  stale_action=actions.store.draft('alice','withdrawal',destination.merge('amount'=>5000),generation)
  expired=service.callback('alice','balance',nil);service.unlink('alice')
  raise 'old link action survived' if service.consume_callback(expired,'101')
  raise 'link survived unlink' if service.current('alice')[:link]
  begin
    actions.confirm(user,stale_action,password);raise 'unlinked action changed money'
  rescue Axiom::Error=>e
    raise unless e.status==409
  end
  raise 'unlink changed money' unless Axiom::WithdrawalStore.new(db).wallet('alice')['available_amount']==87500
  db.close
end
puts 'PASS: web-confirmed Telegram linking, forwarded tokens, cross-account denial, callback replay and unlink invalidation'
