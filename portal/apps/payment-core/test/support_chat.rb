# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
ENV['TELEGRAM_ADMIN_IDS']=''
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/application/support/support'

def assert(value,label)
  raise label unless value
end

def rejects(status)
  begin
    yield
  rescue Axiom::Error=>error
    assert(error.status==status,"Expected #{status}, received #{error.status}")
    return
  end
  raise "Expected rejection #{status}"
end

Dir.mktmpdir('axiom-support-chat-') do |dir|
  db=Axiom::Database.new(File.join(dir,'payments.sqlite'));db.migrate!
  begin
    users=%w[alice bob admin other_admin].to_h do |id|
      role=id.include?('admin') ? 'admin' : 'customer'
      db.connection.execute('INSERT INTO customers(id,username,email,password_hash,password_salt,created_at,role) VALUES(?,?,?,?,?,?,?)',[id,id,"#{id}@example.test",'hash','salt',Axiom.now,role])
      [id,{'id'=>id,'username'=>id,'role'=>role}]
    end
    support=Axiom::Support.new(db)
    alice,bob,admin,other_admin=users.values_at('alice','bob','admin','other_admin')
    initial={'subject'=>'Setoran Alice','message'=>'Pesan pembuka','request_id'=>SecureRandom.uuid}
    a=support.create(alice,initial)
    assert(support.create(alice,initial)['id']==a['id'],'create retry duplicated ticket')
    rejects(409){support.create(alice,initial.merge('message'=>'Berbeda'))}
    b=support.create(bob,{'subject'=>'Setoran Bob','message'=>'Rahasia Bob','request_id'=>initial['request_id']})
    first=support.detail(alice,a['id'])[:messages].first['id']
    bob_first=support.detail(bob,b['id'])[:messages].first['id']
    hidden=support.reply(admin,a['id'],{'message'=>'Catatan rahasia internal','internal'=>true})
    public_body={'message'=>'Jawaban publik','reply_to_id'=>first,'request_id'=>SecureRandom.uuid}
    public_id=support.reply(admin,a['id'],public_body)
    assert(support.reply(admin,a['id'],public_body)==public_id,'retry duplicated message')
    assert(db.connection.get_first_value('SELECT COUNT(*) FROM notification_events WHERE event_key=?',["support:#{public_id}"])==1,'retry duplicated notification')
    rejects(409){support.reply(admin,a['id'],public_body.merge('internal'=>true))}
    rejects(409){support.reply(admin,b['id'],public_body)}
    rejects(400){support.reply(alice,a['id'],{'message'=>'ID tidak valid','request_id'=>'bad'})}
    rejects(404){support.detail(alice,b['id'])}
    rejects(404){support.reply(alice,b['id'],{'message'=>'Tidak boleh'})}
    rejects(404){support.reply(alice,a['id'],{'message'=>'Kutip lintas akun','reply_to_id'=>bob_first})}
    rejects(404){support.reply(admin,a['id'],{'message'=>'Kutip lintas tiket','reply_to_id'=>bob_first})}
    rejects(404){support.reply(alice,a['id'],{'message'=>'Kutip internal','reply_to_id'=>hidden})}
    rejects(404){support.reply(admin,a['id'],{'message'=>'Bocorkan internal','reply_to_id'=>hidden})}
    internal_reply=support.reply(admin,a['id'],{'message'=>'Tindak lanjut internal','internal'=>true,'reply_to_id'=>hidden})
    assert(support.detail(admin,a['id'])[:messages].find{|m|m['id']==internal_reply}['reply_to']['id']==hidden,'admin internal quote missing')
    rejects(403){support.reply(alice,a['id'],{'message'=>'Internal pelanggan','internal'=>true})}
    rejects(400){support.reply(admin,a['id'],{'message'=>'Internal ambigu','internal'=>'true'})}
    listing=lambda{|user,**filters|support.page(user,20,0,**filters).first}
    assert(listing.call(alice,search:'rahasia').empty?,'internal/cross-account search leaked')
    assert(listing.call(admin,search:'rahasia',admin:true).size==2,'admin visible search omitted messages')
    assert(listing.call(alice,search:'Jawaban').map{|r|r['id']}==[a['id']],'visible body search failed')
    assert(listing.call(alice,search:a['id']).size==1,'ticket ID search failed')
    assert(listing.call(alice,search:'Setoran Alice').size==1,'subject search failed')
    assert(listing.call(alice,search:'%').empty?,'search wildcard matched all tickets')
    assert(listing.call(alice,status:'WAITING_CUSTOMER').size==1,'status filter failed')
    assert(listing.call(alice,status:'CLOSED').empty?,'status filter ignored')
    rejects(400){listing.call(alice,status:'INVALID')}
    row=listing.call(alice).first
    assert(row['customer_id']=='alice' && row['last_message']=='Jawaban publik' && row['latest_message_id']==public_id,'visible preview leaked internal')
    assert(row['last_message_at'].is_a?(String) && row['last_message_at'].include?('T'),'preview date not ISO')
    assert(row['unread_count']==1,'own/internal messages counted unread')
    detail=support.detail(alice,a['id'])
    assert(detail[:last_read_message_id]==0,'GET marked read')
    assert(detail[:messages].map{|m|m['id']}==[first,public_id],'customer internal visibility failed')
    quote=detail[:messages].last['reply_to']
    assert(quote['id']==first && quote['actor_username']=='alice' && quote['body']=='Pesan pembuka','reply context missing')
    assert(detail[:messages].none?{|m|m['read_by_other']},'fabricated read receipt')
    rejects(404){support.mark_read(alice,a['id'],hidden)}
    rejects(404){support.mark_read(alice,b['id'],bob_first)}
    rejects(404){support.mark_read(alice,a['id'],bob_first)}
    rejects(400){support.mark_read(alice,a['id'],0)}
    rejects(400){support.mark_read(alice,a['id'],'1')}
    assert(support.mark_read(alice,a['id'],public_id)==public_id,'watermark not saved')
    assert(support.mark_read(alice,a['id'],first)==public_id,'watermark regressed')
    assert(listing.call(alice).first['unread_count']==0,'read messages counted unread')
    assert(support.detail(alice,a['id'])[:last_read_message_id]==public_id,'detail lost viewer watermark')
    assert(support.detail(admin,a['id'])[:messages].find{|m|m['id']==public_id}['read_by_other'],'owner receipt missing')
    support.mark_read(admin,a['id'],first)
    assert(support.detail(alice,a['id'])[:messages].first['read_by_other'],'admin receipt missing')
    db.connection.execute("UPDATE customers SET role='customer' WHERE id='admin'")
    assert(!support.detail(alice,a['id'])[:messages].first['read_by_other'],'former admin receipt persisted')
    db.connection.execute("UPDATE customers SET role='admin' WHERE id='admin'")
    assert(listing.call(other_admin,admin:true).find{|r|r['id']==a['id']}['unread_count']==4,'viewer unread not independent')
    support.mark_read(other_admin,a['id'],internal_reply)
    assert(listing.call(other_admin,admin:true).find{|r|r['id']==a['id']}['unread_count']==0,'admin internal read failed')
    added=4.times.map{|i|support.reply(alice,a['id'],{'message'=>"Tambahan #{i}"})}
    newest=support.detail(alice,a['id'],limit:2)
    assert(newest[:messages].map{|m|m['id']}==added.last(2) && newest[:has_more],'newest page incorrect')
    older=support.detail(alice,a['id'],before:added[2],limit:2)
    assert(older[:messages].map{|m|m['id']}==added.first(2) && older[:has_more],'older page incorrect')
    oldest=support.detail(alice,a['id'],before:added.first,limit:2)
    assert(oldest[:messages].map{|m|m['id']}==[first,public_id] && !oldest[:has_more],'hidden rows corrupted pagination')
    rejects(400){support.detail(alice,a['id'],before:0)}
    rejects(400){support.detail(alice,a['id'],limit:101)}
    assert(support.store.page('alice',20,0).last==1,'legacy page signature broken')
    assert(support.store.messages(a['id'],false).none?{|m|m['internal']==1},'legacy messages signature broken')
    %w[image/png image/jpeg application/pdf].zip(["\x89PNG\r\n\x1a\n".b,"\xff\xd8\xff".b,'%PDF-1.7']).each do |type,bytes|
      assert(support.attachment({'name'=>'safe.file','type'=>type,'data'=>Base64.strict_encode64(bytes)})[:data]==bytes,'valid attachment rejected')
    end
    rejects(400){support.attachment({'name'=>'bad.png','type'=>'image/png','data'=>Base64.strict_encode64('bad')})}
    rejects(400){support.attachment({'name'=>'big.pdf','type'=>'application/pdf','data'=>Base64.strict_encode64('%PDF-'+('x'*2097152))})}
    attachment={'name'=>'proof.pdf','type'=>'application/pdf','data'=>Base64.strict_encode64('%PDF-1.7')}
    file_request={'message'=>'Lampiran','attachment'=>attachment,'request_id'=>SecureRandom.uuid}
    file_id=support.reply(alice,a['id'],file_request)
    assert(support.reply(alice,a['id'],file_request)==file_id,'attachment retry duplicated')
    rejects(409){support.reply(alice,a['id'],file_request.merge('attachment'=>attachment.merge('name'=>'other.pdf')))}
    assert(support.store.attachment(file_id)['attachment']=='%PDF-1.7','attachment persistence failed')
    support.change_status(alice,a['id'],'CLOSED')
    assert(support.reply(admin,a['id'],public_body)==public_id,'closed ticket rejected successful retry')
    assert(support.create(alice,initial)['id']==a['id'],'closed ticket duplicated first send')
    rejects(409){support.reply(alice,a['id'],{'message'=>'Balasan tertutup'})}
    rejects(409){support.reply(admin,a['id'],{'message'=>'Catatan tertutup','internal'=>true})}
    support.change_status(alice,a['id'],'OPEN')
    assert(support.reply(alice,a['id'],{'message'=>'Dibuka kembali'},channel:'telegram').is_a?(Integer),'Telegram compatible reply failed')
    concurrent={'message'=>'Kirim serentak','request_id'=>SecureRandom.uuid}
    results=2.times.map do
      Thread.new do
        begin
          support.reply(alice,a['id'],concurrent)
        ensure
          db.release
        end
      end
    end.map(&:value)
    assert(results.uniq.length==1,'concurrent retry duplicated message')
    assert(db.connection.get_first_value('SELECT COUNT(*) FROM support_tickets')==2,'retries produced extra tickets')
  ensure
    db.close
  end
end
puts 'PASS: support chat isolation, search, replies, receipts, unread, pagination, retries, attachments, closed/reopen'
