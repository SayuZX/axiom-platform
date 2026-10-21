# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/application/identity/auth'
require_relative '../lib/axiom/infrastructure/persistence/admin_store'
def assert(value,message)
  raise message unless value
end
def rejects(status)
  begin
    yield
  rescue Axiom::Error => e
    raise unless e.status==status
    return
  end
  raise "Expected #{status}"
end
Dir.mktmpdir('axiom-api-keys') do |dir|
  db=Axiom::Database.new(File.join(dir,'keys.sqlite'));db.migrate!;db.migrate!
  %w[alice bob admin].each { |id| db.connection.execute('INSERT INTO customers(id,username,email,password_hash,password_salt,created_at,role) VALUES(?,?,?,?,?,?,?)',[id,id,"#{id}@example.test",'hash','salt',Axiom.now,id=='admin' ? 'admin' : 'customer']) }
  store=Axiom::AuthStore.new(db);admin=Axiom::AdminStore.new(db)
  config=Axiom::Config.new({'PUBLIC_URL'=>'http://127.0.0.1:3084','DATA_DIR'=>dir,'API_KEY'=>'test-secret-key-long-enough-not-production'})
  auth=Axiom::Auth.new(db,config)
  assert(store.key_usage('alice')=={active:0,limit:10},'default limit')
  [nil,true,'2',1.5,-1,101].each { |value| rejects(400) { admin.key_limit('alice',value,'admin') } }
  rejects(403) { admin.key_limit('alice',2,'bob') }
  rejects(404) { admin.key_limit('missing',2,'admin') }
  admin.key_limit('alice',0,'admin');rejects(409) { auth.create_key('alice',{'name'=>'blocked'}) }
  assert(store.keys('alice').empty?,'zero limit inserted key')
  admin.key_limit('alice',1,'admin')
  created=auth.create_key('alice',{'name'=>'server'});key=created[:key];secret=created[:secret]
  assert(!JSON.generate(auth.keys('alice')).include?(secret),'active listing exposed secret')
  assert(store.key(Axiom.digest(secret))['id']=='alice','credential rejected')
  assert(store.keys('bob').empty?,'cross-owner listing')
  rejects(404) { store.revoke(key['id'],'bob') };rejects(404) { store.remove_key(key['id'],'bob') }
  rejects(409) { store.remove_key(key['id'],'alice') }
  rejects(409) { auth.create_key('alice',{'name'=>'over limit'}) }
  admin.key_limit('alice',0,'admin')
  assert(store.key(Axiom.digest(secret)),'limit reduction revoked key')
  store.revoke(key['id'],'alice');store.revoke(key['id'],'alice');store.remove_key(key['id'],'alice');store.remove_key(key['id'],'alice')
  assert(store.keys('alice').empty?,'tombstone listed')
  assert(!store.key(Axiom.digest(secret)),'removed credential accepted')
  row=db.connection.get_first_row('SELECT * FROM customer_keys WHERE id=?',[key['id']])
  assert(row['deleted_at'] && row['revoked_at'] && row['key_hash']==Axiom.digest(secret),'historical credential row lost')
  assert(db.connection.get_first_value('SELECT COUNT(*) FROM action_audit WHERE resource_id=?',[key['id']])==3,'lifecycle audit lost or duplicated')
  assert(db.connection.get_first_value('SELECT COUNT(*) FROM email_outbox WHERE event_key LIKE ?',["security:key:#{key['id']}:%"])==2,'security notification history lost')
  [row,auth.keys('alice'),created[:key],db.connection.execute('SELECT * FROM action_audit'),db.connection.execute('SELECT * FROM email_outbox'),db.connection.execute('SELECT * FROM notification_events'),db.connection.execute('SELECT * FROM telegram_deliveries')].each { |data| assert(!JSON.generate(data).include?(secret),'secret leaked') }
  admin.key_limit('alice',1,'admin')
  ready=Queue.new;start=Queue.new
  threads=2.times.map do |i|
    Thread.new do
      db.connection;ready << true;start.pop
      begin
        auth.create_key('alice',{'name'=>"race-#{i}"});201
      rescue Axiom::Error=>e
        e.status
      ensure
        db.release
      end
    end
  end
  2.times { ready.pop };2.times { start << true }
  assert(threads.map(&:value).sort==[201,409],'concurrent limit bypass')
  assert(store.key_usage('alice')=={active:1,limit:1},'revoked historical key counted')
  before=store.keys('bob').size
  begin
    db.transaction { auth.create_key('bob',{'name'=>'rollback'});raise 'abort' }
  rescue RuntimeError=>e
    raise unless e.message=='abort'
  end
  assert(store.keys('bob').size==before,'transaction rollback failed')
  admin.key_limit('bob',100,'admin');assert(store.key_usage('bob')[:limit]==100,'maximum bound rejected')
  db.close
end
puts 'PASS: API key ownership, strict limits, concurrent creation, rollback, tombstone audit, secret safety'
