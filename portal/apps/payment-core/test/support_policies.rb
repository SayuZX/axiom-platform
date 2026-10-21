# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/application/support/support'
require_relative '../lib/axiom/application/policies/policies'

Dir.mktmpdir('axiom-support-') do |dir|
  db=Axiom::Database.new(File.join(dir,'payments.sqlite'));db.migrate!
  users=%w[alice bob admin].to_h do |id|
    role=id=='admin' ? 'admin' : 'customer'
    db.connection.execute('INSERT INTO customers(id,username,email,password_hash,password_salt,created_at,role) VALUES(?,?,?,?,?,?,?)',[id,id,"#{id}@example.test",'hash','salt',Axiom.now,role])
    [id,{'id'=>id,'username'=>id,'role'=>role}]
  end
  support=Axiom::Support.new(db)
  a=support.create(users['alice'],{'subject'=>'Alice issue','message'=>'Alice message'})
  b=support.create(users['bob'],{'subject'=>'Bob issue','message'=>'Bob message'})
  support.reply(users['admin'],b['id'],{'message'=>'Reply only Bob'})
  support.reply(users['admin'],a['id'],{'message'=>'Private investigation','internal'=>true})
  raise 'cross-ticket reply leaked' if support.detail(users['alice'],a['id'])[:messages].any?{|m|m['body'].include?('Bob')}
  raise 'internal note leaked' if support.detail(users['alice'],a['id'])[:messages].any?{|m|m['internal']==1}
  begin
    support.detail(users['alice'],b['id']);raise 'cross-account ticket read'
  rescue Axiom::Error=>e
    raise unless e.status==404
  end
  support.change_status(users['alice'],a['id'],'CLOSED')
  begin
    support.reply(users['alice'],a['id'],{'message'=>'closed reply'});raise 'closed ticket reply accepted'
  rescue Axiom::Error=>e
    raise unless e.status==409
  end
  support.change_status(users['alice'],a['id'],'OPEN')
  support.reply(users['alice'],a['id'],{'message'=>'Reopened'})
  begin
    support.attachment({'name'=>'fake.png','type'=>'image/png','data'=>Base64.strict_encode64('executable')});raise 'fake attachment accepted'
  rescue Axiom::Error=>e
    raise unless e.status==400
  end
  policies=Axiom::Policies.new(db,{})
  raise 'incomplete legal policy published' if policies.published?
  begin
    policies.document('terms-of-service');raise 'draft exposed publicly'
  rescue Axiom::Error=>e
    raise unless e.status==503
  end
  config=JSON.parse(File.read(File.expand_path('../../../operations/policy-config.json',__dir__)))
  file=File.join(dir,'policy.json');File.write(file,JSON.generate(config))
  active=Axiom::Policies.new(db,{'POLICY_CONFIG_FILE'=>file,'POLICIES_PUBLISHED'=>'true'})
  raise 'operator publication blocked by administrative flags' unless active.current[:active]
  Axiom::PolicyContent::TITLES.each_key { |slug| raise 'policy unavailable' unless active.document(slug)[:published] }
  begin
    active.validate_registration({});raise 'consent bypassed'
  rescue Axiom::Error=>e
    raise unless e.status==400
  end
  raise 'active consent rejected' unless active.validate_registration({'accept_tos'=>true,'tos_version'=>config['version']})==config['version']
  document={slug:'terms-of-service',version:'1',title:'Test',effective_at:'2026-10-10',updated_at:'2026-10-10',sections:[{heading:'Scope',text:'Immutable terms'}]}
  policies.store.archive(document);policies.store.consent('alice','1','web')
  begin
    policies.store.archive(document.merge(sections:[{heading:'Scope',text:'Changed silently'}]));raise 'archive overwritten'
  rescue Axiom::Error=>e
    raise unless e.status==409
  end
  raise 'consent missing' unless db.connection.get_first_value("SELECT COUNT(*) FROM policy_consents WHERE customer_id='alice' AND version='1'")==1
  db.close
end
puts 'PASS: concurrent ticket isolation, internal notes, closed/reopen, attachment validation, private drafts, immutable versions and consent'
