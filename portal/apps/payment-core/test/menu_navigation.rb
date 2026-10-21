# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'tmpdir'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/persistence/database'
require_relative '../lib/axiom/infrastructure/persistence/telegram_store'

Dir.mktmpdir('axiom-menu-') do |dir|
  file=File.join(dir,'payments.sqlite')
  db=Axiom::Database.new(file);db.migrate!
  store=Axiom::TelegramStore.new(db)
  first=store.begin_menu('101')
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'First menu'},menu_revision:first)
  row=store.claim_delivery
  store.delivered(row,{'message_id'=>1001})
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'Ticket notification'},event_key:'support:keep')
  db.connection.execute("UPDATE telegram_deliveries SET state='sent',message_id=1002 WHERE event_key='support:keep'")
  second=store.begin_menu('101')
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'Second menu'},menu_revision:second)
  deletion=db.connection.get_first_row("SELECT * FROM telegram_deliveries WHERE method='deleteMessages'")
  raise 'old menu not queued for deletion' unless JSON.parse(deletion['payload_json'])['message_ids']==[1001]
  raise 'ticket notification removed' unless db.connection.get_first_value("SELECT state FROM telegram_deliveries WHERE event_key='support:keep'")=='sent'
  store.begin_menu('101')
  raise 'stale pending menu survived' unless db.connection.get_first_value('SELECT state FROM telegram_deliveries WHERE menu_revision=?',[second])=='cancelled'
  db.connection.execute('DELETE FROM telegram_runtime')
  deletion=store.claim_delivery;store.delivered(deletion,true)
  raise 'deleted menu not recorded' unless db.connection.get_first_value('SELECT state FROM telegram_deliveries WHERE message_id=1001')=='deleted'
  revision=store.begin_menu('101');store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'In flight'},menu_revision:revision)
  db.connection.execute('DELETE FROM telegram_runtime')
  in_flight=store.claim_delivery
  store.begin_menu('101')
  store.delivered(in_flight,{'message_id'=>1003})
  raise 'late old menu not cleaned up' unless db.connection.execute("SELECT payload_json FROM telegram_deliveries WHERE method='deleteMessages' AND state='pending'").any?{|r|JSON.parse(r['payload_json'])['message_ids'].include?(1003)}
  db.close
  db=Axiom::Database.new(file);db.migrate!;store=Axiom::TelegramStore.new(db)
  db.connection.execute('DELETE FROM telegram_runtime')
  restored=store.claim_delivery
  raise 'cleanup lost on restart' unless restored['method']=='deleteMessages'
  store.delivered(restored,true)
  raise 'late cleanup not persisted' unless db.connection.get_first_value('SELECT state FROM telegram_deliveries WHERE message_id=1003')=='deleted'
  raise 'revision lost on restart' unless store.begin_menu('101')>revision
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'Legacy menu or notification'},event_key:'legacy:keep')
  db.connection.execute("UPDATE telegram_deliveries SET state='sent',message_id=1004,sent_at=? WHERE event_key='legacy:keep'",[Axiom.now])
  expired=store.begin_menu('101')
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'Expired menu'},menu_revision:expired,event_key:'expired:keep')
  db.connection.execute("UPDATE telegram_deliveries SET state='sent',message_id=1005,sent_at=? WHERE event_key='expired:keep'",[Axiom.now-172800001])
  store.begin_menu('101')
  raise 'legacy or expired messages deleted' unless db.connection.get_first_value("SELECT COUNT(*) FROM telegram_deliveries WHERE event_key IN ('legacy:keep','expired:keep') AND state='sent'")==2
  split=store.begin_menu('101')
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'x'*7001,reply_markup:{inline_keyboard:[]}},menu_revision:split)
  chunks=db.connection.execute('SELECT * FROM telegram_deliveries WHERE menu_revision=?',[split])
  raise 'chunk revision missing' unless chunks.length==3 && chunks.map{|r|JSON.parse(r['payload_json'])['text'].length}==[3500,3500,1]
  store.begin_menu('101')
  raise 'split menu cancellation incomplete' unless db.connection.get_first_value("SELECT COUNT(*) FROM telegram_deliveries WHERE menu_revision=? AND state='cancelled'",[split])==3
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'Late enqueue'},menu_revision:split)
  raise 'late enqueue revived stale menu' unless db.connection.get_first_value("SELECT state FROM telegram_deliveries WHERE payload_json LIKE '%Late enqueue%'")=='cancelled'
  expiring=store.begin_menu('101')
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'Expiring before cleanup'},menu_revision:expiring,event_key:'expires-in-queue')
  db.connection.execute("UPDATE telegram_deliveries SET state='sent',message_id=1006,sent_at=? WHERE event_key='expires-in-queue'",[Axiom.now])
  store.begin_menu('101')
  db.connection.execute("UPDATE telegram_deliveries SET sent_at=? WHERE event_key='expires-in-queue'",[Axiom.now-172800001])
  db.connection.execute('DELETE FROM telegram_runtime')
  raise 'expired deletion sent to Telegram' if store.claim_delivery
  raise 'expired menu falsely marked deleted' unless db.connection.get_first_value("SELECT state FROM telegram_deliveries WHERE event_key='expires-in-queue'")=='sent'
  retrying=store.begin_menu('101')
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'Stale retry'},menu_revision:retrying,event_key:'stale-retry')
  in_flight=store.claim_delivery
  store.begin_menu('101');store.delivery_failed(in_flight,503)
  raise 'failed stale menu retried' unless db.connection.get_first_value("SELECT state FROM telegram_deliveries WHERE event_key='stale-retry'")=='cancelled'
  db.connection.execute('DELETE FROM telegram_runtime')
  abandoned=store.begin_menu('101')
  store.enqueue(chat_id:'101',method:'sendMessage',payload:{text:'Abandoned request'},menu_revision:abandoned,event_key:'abandoned')
  store.claim_delivery;store.begin_menu('101')
  db.close;db=Axiom::Database.new(file);db.migrate!;store=Axiom::TelegramStore.new(db)
  db.connection.execute("UPDATE telegram_deliveries SET lease_until=0 WHERE event_key='abandoned'")
  db.connection.execute('DELETE FROM telegram_runtime')
  raise 'stale in-flight menu resent after restart' if store.claim_delivery
  raise 'stale in-flight lease not cancelled' unless db.connection.get_first_value("SELECT state FROM telegram_deliveries WHERE event_key='abandoned'")=='cancelled'
  db.connection.execute("INSERT INTO customers(id,username,email,password_hash,password_salt,created_at) VALUES('menu-user','menu-user','menu@example.test','hash','salt',1)")
  db.connection.execute("INSERT INTO telegram_links(customer_id,user_id,chat_id,generation,created_at) VALUES('menu-user','202','202','menu-generation',1)")
  store.callback('menu-user','old-callback','balance',nil)
  store.begin_menu('202')
  store.callback('menu-user','new-callback','balance',nil)
  raise 'old callback remained active' if store.consume('old-callback','202')
  raise 'fresh callback invalidated' unless store.consume('new-callback','202')
  mapped=store.begin_menu('202')
  store.enqueue(chat_id:'202',method:'sendMessage',payload:{text:'Mapped support message'},menu_revision:mapped,event_key:'mapped:keep')
  db.connection.execute("UPDATE telegram_deliveries SET state='sent',message_id=2001,sent_at=? WHERE event_key='mapped:keep'",[Axiom.now])
  db.connection.execute("INSERT INTO support_telegram_messages VALUES('202',2001,'ticket',1,'menu-user','menu-generation')")
  store.begin_menu('202')
  raise 'mapped support message removed' unless db.connection.get_first_value("SELECT state FROM telegram_deliveries WHERE event_key='mapped:keep'")=='sent'
  raise 'support mapping removed' unless db.connection.get_first_value("SELECT COUNT(*) FROM support_telegram_messages WHERE message_id=2001")==1
  protected_revision=store.begin_menu('202')
  store.enqueue(chat_id:'202',method:'sendMessage',payload:{text:'Pending support'},ticket_id:'ticket',support_message_id:1,menu_revision:protected_revision,event_key:'pending-support:keep')
  store.begin_menu('202')
  protected=db.connection.get_first_row("SELECT * FROM telegram_deliveries WHERE event_key='pending-support:keep'")
  raise 'support enqueue accepted a menu revision' unless protected['menu_revision'].nil? && protected['state']=='pending'
ensure
  db&.close
end
puts 'PASS: menu cleanup, pending cancellation, late delivery, restart, split chunks, stale callbacks, 48-hour limit and support preservation'
