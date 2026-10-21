# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/interfaces/telegram/assistant'
Dir.mktmpdir('axiom-channel-edges') do |dir|
  db=Axiom::Database.new(File.join(dir,'payments.sqlite'));db.migrate!
  %w[alice bob operator].each do |id|
    db.connection.execute('INSERT INTO customers(id,username,email,password_hash,password_salt,created_at,role) VALUES(?,?,?,?,?,?,?)',[id,id,"#{id}@example.test",'hash','salt',1,id=='operator' ? 'admin' : 'customer'])
  end
  db.connection.execute("INSERT INTO telegram_links(customer_id,user_id,chat_id,generation,created_at) VALUES('operator','303','303','op-gen',1)")
  ENV['TELEGRAM_ADMIN_IDS']='303'
  config=Axiom::Config.new({'DATA_DIR'=>dir,'PUBLIC_URL'=>'http://127.0.0.1:3084','API_KEY'=>'fixture-secret-key-with-enough-characters'})
  assistant=Axiom::Assistant.new(db,config);store=Axiom::TelegramStore.new(db);support=Axiom::Support.new(db)
  a=support.create({'id'=>'alice','role'=>'customer'},{'subject'=>'Alice issue','message'=>'Alice message'})
  b=support.create({'id'=>'bob','role'=>'customer'},{'subject'=>'Bob issue','message'=>'Bob message'})
  support.change_status({'id'=>'bob','role'=>'customer'},b['id'],'CLOSED')
  actor=store.actor('303','303');assistant.dispatch(actor,'ticket',a['id']);assistant.dispatch(actor,'ticket',b['id'])
  raise 'closed ticket retained another recipient' if store.conversation('operator')
  store.cancel('operator')
  db.connection.execute("UPDATE telegram_deliveries SET state='cancelled'")
  store.enqueue(chat_id:'303',customer_id:'operator',generation:'op-gen',method:'sendMessage',payload:{text:'Private customer report'},admin_required:true)
  db.connection.execute("UPDATE customers SET role='customer' WHERE id='operator'")
  raise 'revoked admin received queued private report' if store.claim_delivery
  db.connection.execute("UPDATE customers SET role='admin' WHERE id='operator'")
  db.connection.execute("INSERT INTO support_telegram_messages VALUES('303',700,?,1,'alice','op-gen')",[a['id']])
  assistant.process({'update_id'=>9,'message'=>{'message_id'=>9,'from'=>{'id'=>303},'chat'=>{'id'=>303,'type'=>'private'},'caption'=>'Caption must survive','reply_to_message'=>{'message_id'=>700}}})
  raise 'caption lost' unless support.detail({'id'=>'alice','role'=>'customer'},a['id'])[:messages].last['body']=='Caption must survive'
  incoming=->(text,reply=nil){m={'from'=>{'id'=>303},'chat'=>{'id'=>303,'type'=>'private'},'text'=>text};m['reply_to_message']={'message_id'=>reply} if reply;assistant.process({'update_id'=>200,'message'=>m})}
  assistant.dispatch(actor,'internal_note',a['id'])
  queued=db.connection.get_first_value('SELECT COUNT(*) FROM email_outbox')
  incoming.call('Private quoted note',700)
  note=support.detail({'id'=>'operator','role'=>'admin'},a['id'])[:messages].last
  raise 'quoted internal note became public' unless note['internal']==1 && note['body']=='Private quoted note'
  raise 'internal note delivered to customer' unless db.connection.get_first_value('SELECT COUNT(*) FROM email_outbox')==queued
  support.change_status({'id'=>'bob','role'=>'customer'},b['id'],'OPEN')
  bob_message=support.detail({'id'=>'bob','role'=>'customer'},b['id'])[:messages].first['id']
  db.connection.execute("INSERT INTO support_telegram_messages VALUES('303',701,?,?,'bob','op-gen')",[b['id'],bob_message])
  assistant.dispatch(actor,'internal_note',a['id'])
  count=db.connection.get_first_value('SELECT COUNT(*) FROM support_messages')
  incoming.call('Wrong ticket private quote',701)
  raise 'internal mode crossed tickets' unless db.connection.get_first_value('SELECT COUNT(*) FROM support_messages')==count
  assistant.dispatch(actor,'ticket',a['id']);incoming.call('Public reply to Bob',701)
  count=db.connection.get_first_value('SELECT COUNT(*) FROM support_messages')
  incoming.call('Unaddressed follow-up')
  raise 'quoted reply left stale recipient' unless db.connection.get_first_value('SELECT COUNT(*) FROM support_messages')==count
  assistant.dispatch(actor,'ticket',a['id']);assistant.dispatch(actor,'admin');incoming.call('Text after navigation')
  raise 'admin menu retained support recipient' unless db.connection.get_first_value('SELECT COUNT(*) FROM support_messages')==count
  store.ingest({'update_id'=>10,'message'=>{'from'=>{'id'=>303},'chat'=>{'id'=>303,'type'=>'private'},'text'=>'/menu'}})
  row=store.claim_update;store.retry_update(row,'Telegram429',2)
  raise 'transient update immediately retried' if store.claim_update
  db.connection.execute('UPDATE telegram_updates SET next_attempt_at=0 WHERE update_id=10')
  raise 'transient update lost' unless store.claim_update
  %w[payment_review withdraw_review admin_status_review].each_with_index do |step,index|
    revision=store.begin_menu('303')
    store.converse('operator',step,{'review_id'=>"review-#{index}"})
    store.callback('operator',"review-button-#{index}",'payment_confirm',"review-#{index}")
    store.enqueue(chat_id:'303',method:'sendMessage',payload:{text:'Financial confirmation'},menu_revision:revision,event_key:"review-send-#{index}")
    assistant.process({'update_id'=>100+index,'message'=>{'from'=>{'id'=>303},'chat'=>{'id'=>303,'type'=>'private'},'text'=>'Masih menunggu konfirmasi'}})
    raise 'extra review text cancels confirmation message' unless db.connection.get_first_value('SELECT state FROM telegram_deliveries WHERE event_key=?',["review-send-#{index}"])=='pending'
    raise 'extra review text invalidates confirmation button' unless store.consume("review-button-#{index}",'303')
  end
  store.converse('operator','payment_review',{'amount'=>100000,'review_id'=>'new-review'})
  begin
    assistant.dispatch(actor,'payment_confirm','old-review');raise 'old button confirmed newer draft'
  rescue Axiom::Error=>e
    raise unless e.status==409
  end
  raise 'stale button created action' unless db.connection.get_first_value('SELECT COUNT(*) FROM secure_actions')==0
  assistant.dispatch(actor,'payment_confirm','new-review')
  raise 'matching draft confirmation lost' unless JSON.parse(db.connection.get_first_value('SELECT payload_json FROM secure_actions'))['amount']==100000
  db.connection.execute("INSERT INTO telegram_links(customer_id,user_id,chat_id,generation,created_at) VALUES('alice','101','101','alice-gen',1)")
  customer=store.actor('101','101')
  %w[menu balance payments withdrawals report_daily report_monthly keys preferences support policies account].each{|action|assistant.dispatch(customer,action)}
  assistant.dispatch(customer,'preference_toggle','telegram_enabled')
  raise 'notification consent not saved' unless store.preferences('alice')['telegram_enabled']==1
  assistant.dispatch(customer,'digest','daily')
  raise 'digest preference not saved' unless store.preferences('alice')['digest']=='daily'
  assistant.dispatch(customer,'quiet')
  assistant.process({'update_id'=>11,'message'=>{'message_id'=>11,'from'=>{'id'=>101},'chat'=>{'id'=>101,'type'=>'private'},'text'=>'22 7'}})
  raise 'quiet hours not saved' unless store.preferences('alice').values_at('quiet_start','quiet_end')==[22,7]
  begin
    assistant.dispatch(customer,'admin',nil);raise 'customer gained admin menu'
  rescue Axiom::Error=>e
    raise unless e.status==403
  end
  db.connection.execute("INSERT INTO payments(id,trx_id,amount,qr,created_at,expires_at,status,customer_id,fee_amount) VALUES('bot-paid','AXP-bot-paid',100000,'000201',1,2,'PAID','alice',2500)")
  withdrawal=Axiom::Withdrawals.new(db).create(customer_id:'alice',body:{'amount'=>10000,'bank_name'=>'BCA','account_number'=>'0012345678','account_holder'=>'Alice','request_id'=>'bot-withdrawal-0001','expected_customer_id'=>'alice'})[1][:withdrawal]
  %w[admin admin_overview admin_payments admin_customers admin_withdrawals admin_commissions admin_support admin_alerts].each{|action|assistant.dispatch(actor,action)}
  assistant.dispatch(actor,'admin_process',withdrawal['id'])
  review=store.conversation('operator')['payload']
  assistant.dispatch(actor,'admin_status_confirm',review['review_id'])
  raise 'bot mutated money before step-up' unless db.connection.get_first_value('SELECT status FROM withdrawals WHERE id=?',[withdrawal['id']])=='REQUESTED'
  payload=JSON.parse(db.connection.get_first_value("SELECT payload_json FROM secure_actions WHERE kind='withdrawal_status'"))
  raise 'admin draft resource mismatch' unless payload['id']==withdrawal['id'] && payload['status']=='PROCESSING'
  pref=store.preferences('alice');now=Time.now.getlocal('+07:00')
  store.preferences_update('alice',[1,1,1,1,'off',now.hour,(now.hour+1)%24,1])
  outbox=Axiom::OutboxStore.new(db)
  event={kind:'payment',id:'event-fixture',reference:'AXP-event-fixture',status:'PAID',amount:100000,fee_amount:2500,net_amount:97500}
  db.transaction { outbox.enqueue(event_key:'snapshot-event',customer_id:'alice',payload:event) }
  event[:status]='EXPIRED'
  saved=db.connection.get_first_row("SELECT * FROM telegram_deliveries WHERE event_key='snapshot-event'")
  raise 'quiet hours ignored' unless saved['available_at']>Axiom.now
  raise 'event snapshot changed after enqueue' unless JSON.parse(saved['payload_json'])['text'].include?('Selesai terkonfirmasi')
  db.connection.execute("UPDATE email_outbox SET state='failed' WHERE event_key='snapshot-event'")
  raise 'email failure changed Telegram channel' unless db.connection.get_first_value("SELECT state FROM telegram_deliveries WHERE event_key='snapshot-event'")=='pending'
  raise 'email failure changed balance' unless Axiom::WithdrawalStore.new(db).wallet('alice')['available_amount']==87500
ensure
  db&.close
end
puts 'PASS: closed-ticket context, send-time admin revocation, media caption, durable bounded inbound retry'
