const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const core = path.resolve(__dirname, '..');
const ruby = process.env.RUBY || 'ruby';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-telegram-'));
const calls = [];
let failure = null;
let db;
let holdChat = null;
let held = null;
let nextMessageId = 1000;
const api = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');
  const method = req.url.split('/').at(-1);
  res.setHeader('Content-Type', 'application/json');
  if (method === 'getMe') return res.end(JSON.stringify({ok: true, result: {is_bot: true, username: 'axiom_fixture_bot'}}));
  if (method === 'getWebhookInfo') return res.end(JSON.stringify({ok: true, result: {url: ''}}));
  const call = {method, body};
  calls.push(call);
  if (failure) return res.end(JSON.stringify({ok: false, error_code: failure, parameters: {retry_after: 2}}));
  const result = method.startsWith('send') ? {message_id: ++nextMessageId, date: Math.floor(Date.now()/1000)} : true;
  if (result.message_id) call.message_id = result.message_id;
  if (method === 'sendMessage' && body.chat_id === holdChat) {
    holdChat = null;
    held = {res, result};
    api.emit('held');
    return;
  }
  res.end(JSON.stringify({ok: true, result}));
});
async function main() {
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const env = {...process.env, BUNDLE_GEMFILE: path.join(core, 'Gemfile'), DATA_DIR: dir, RACK_ENV: 'test', PUBLIC_URL: 'http://127.0.0.1:3084', API_KEY: 'fixture-master-key-not-a-production-secret', TELEGRAM_MODE: 'webhook', TELEGRAM_BOT_TOKEN: '123:fixture', TELEGRAM_BOT_USERNAME: 'axiom_fixture_bot', TELEGRAM_TEST_URL: `http://127.0.0.1:${api.address().port}`, TELEGRAM_ADMIN_IDS: '303', EMAIL_DELIVERY_ENABLED: 'false'};
  const init = spawnSync(ruby, ['-e', `require '${path.join(core,'lib/axiom/config').replaceAll('\\','/')}'; require '${path.join(core,'lib/axiom/infrastructure/persistence/database').replaceAll('\\','/')}'; d=Axiom::Database.new(File.join(ENV.fetch('DATA_DIR'),'payments.sqlite'));d.migrate!;d.close`], {env, encoding: 'utf8'});
  assert.equal(init.status, 0, init.stderr);
  db = new DatabaseSync(path.join(dir, 'payments.sqlite'));
  for (const [id, uid, role] of [['alice','101','customer'], ['bob','202','customer'], ['operator','303','admin']]) {
    db.prepare('INSERT INTO customers(id,username,email,password_hash,password_salt,created_at,role) VALUES(?,?,?,?,?,?,?)').run(id,id,id+'@example.test','hash','salt',Date.now(),role);
    db.prepare('INSERT INTO telegram_links(customer_id,user_id,chat_id,generation,created_at) VALUES(?,?,?,?,?)').run(id,uid,uid,'generation-'+id,Date.now());
    db.prepare('INSERT INTO notification_preferences(customer_id,telegram_enabled) VALUES(?,1)').run(id);
  }
  function update(updateId, uid, text, extra={}) {
    const payload = {update_id:updateId,message:{message_id:updateId,from:{id:Number(uid),first_name:uid},chat:{id:Number(uid),type:'private'},text,...extra}};
    db.prepare('INSERT OR IGNORE INTO telegram_updates(update_id,payload_json,created_at) VALUES(?,?,?)').run(updateId,JSON.stringify(payload),Date.now());
  }
  async function work() {
    const child = spawn(ruby,[path.join(core,'bin/worker'),'--once'],{env,stdio:['ignore','pipe','pipe']});
    let errors='';child.stderr.on('data',c=>errors+=c);
    const [code]=await once(child,'exit');assert.equal(code,0,errors);
  }
  async function drain() {
    for (let n=0; n<40 && db.prepare("SELECT COUNT(*) n FROM telegram_deliveries WHERE state='pending'").get().n; n++) {
      db.prepare('DELETE FROM telegram_runtime').run();
      await work();
    }
    assert.equal(db.prepare("SELECT COUNT(*) n FROM telegram_deliveries WHERE state='pending'").get().n,0,'delivery queue did not drain');
  }
  function callback(updateId, uid, source, label) {
    const data=source.body.reply_markup.inline_keyboard.flat().find(b=>b.text===label).callback_data;
    const payload={update_id:updateId,callback_query:{id:'cb-'+updateId,from:{id:Number(uid)},message:{message_id:source.message_id,chat:{id:Number(uid),type:'private'}},data}};
    db.prepare('INSERT INTO telegram_updates(update_id,payload_json,created_at) VALUES(?,?,?)').run(updateId,JSON.stringify(payload),Date.now());
  }
  update(1,101,'/menu');update(1,101,'/menu');
  await work();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM telegram_updates WHERE state='done'").get().n,1);
  const menu = calls.find(c=>c.method==='sendMessage'&&c.body.chat_id==='101'&&c.body.reply_markup?.inline_keyboard.length);
  assert.ok(menu,'main menu was not delivered');
  callback(2,101,menu,'Buat invoice');
  await work();
  await drain();
  assert.ok(calls.some(c=>c.method==='deleteMessages'&&c.body.chat_id==='101'&&c.body.message_ids.includes(menu.message_id)),'old menu deletion never reached Telegram');
  assert.equal(db.prepare('SELECT state FROM telegram_deliveries WHERE message_id=?').get(menu.message_id).state,'deleted');
  assert.equal(db.prepare("SELECT step FROM telegram_conversations WHERE customer_id='alice'").get().step,'payment_amount');
  update(3,101,'100000');await work();
  assert.equal(db.prepare("SELECT step FROM telegram_conversations WHERE customer_id='alice'").get().step,'payment_review');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM payments').get().n,0,'chat cannot bypass financial confirmation');
  update(4,101,'/bantuan');update(5,101,'/batal');
  update(6,101,'/menu');await work();
  await drain();
  assert.ok(db.prepare("SELECT COUNT(*) n FROM telegram_deliveries WHERE chat_id='101' AND menu_revision IS NOT NULL AND state='cancelled'").get().n>0,'pending intermediate menus survived');
  const latestMenu=calls.findLast(c=>c.method==='sendMessage'&&c.body.chat_id==='101'&&c.body.reply_markup?.inline_keyboard.flat().some(b=>b.text==='Saldo'));
  callback(9,101,menu,'Saldo');await work();
  assert.equal(db.prepare("SELECT revision FROM telegram_menus WHERE chat_id='101'").get().revision,6,'rejected callback advanced revision');
  assert.ok(db.prepare("SELECT payload_json FROM telegram_deliveries WHERE event_key='callback-answer:9'").get().payload_json.includes('kedaluwarsa'));
  callback(10,101,latestMenu,'Notifikasi');await work();await drain();
  const preferences=calls.findLast(c=>c.method==='sendMessage'&&c.body.chat_id==='101'&&c.body.reply_markup?.inline_keyboard.flat().some(b=>b.text.startsWith('Aktivasi Telegram:')));
  assert.ok(preferences,'fresh controls were invalidated by stale callback');
  const beforeToggle=db.prepare("SELECT revision FROM telegram_menus WHERE chat_id='101'").get().revision;
  callback(11,101,preferences,'Harian');await work();await drain();
  assert.equal(db.prepare("SELECT revision FROM telegram_menus WHERE chat_id='101'").get().revision,beforeToggle+1,'recursive dispatch allocated a second revision');
  assert.equal(db.prepare("SELECT digest FROM notification_preferences WHERE customer_id='alice'").get().digest,'daily');
  db.prepare("UPDATE notification_preferences SET digest='off' WHERE customer_id='alice'").run();
  const now=Date.now();
  db.prepare("INSERT INTO support_tickets VALUES('A','alice','Alice issue','WAITING_ADMIN',?,?)").run(now,now);
  db.prepare("INSERT INTO support_tickets VALUES('B','bob','Bob issue','WAITING_ADMIN',?,?)").run(now,now);
  const aliceMessage=Number(db.prepare("INSERT INTO support_messages(ticket_id,actor_id,channel,body,created_at) VALUES('A','alice','web','Pesan Alice',?)").run(now).lastInsertRowid);
  const bobMessage=Number(db.prepare("INSERT INTO support_messages(ticket_id,actor_id,channel,body,created_at) VALUES('B','bob','web','Pesan Bob',?)").run(now).lastInsertRowid);
  db.prepare("INSERT INTO support_telegram_messages VALUES('303',700,'A',?,'alice','generation-operator')").run(aliceMessage);
  db.prepare("INSERT INTO support_telegram_messages VALUES('303',701,'B',?,'bob','generation-operator')").run(bobMessage);
  for (const [key,id,ticket,message] of [['support:alice',700,'A',aliceMessage],['support:bob',701,'B',bobMessage]]) {
    db.prepare("INSERT INTO telegram_deliveries(event_key,chat_id,method,payload_json,available_at,state,message_id,sent_at,ticket_id,support_message_id) VALUES(?,'303','sendMessage','{}',0,'sent',?,?,?,?)").run(key,id,now,ticket,message);
  }
  update(7,303,'Balasan untuk Bob',{reply_to_message:{message_id:701}});
  update(8,303,'Balasan untuk Alice',{reply_to_message:{message_id:700}});
  await work();
  assert.equal(db.prepare("SELECT body FROM support_messages WHERE ticket_id='A' AND actor_id='operator'").get().body,'Balasan untuk Alice');
  assert.equal(db.prepare("SELECT body FROM support_messages WHERE ticket_id='B' AND actor_id='operator'").get().body,'Balasan untuk Bob');
  assert.equal(db.prepare("SELECT reply_to_id FROM support_messages WHERE ticket_id='A' AND actor_id='operator'").get().reply_to_id,aliceMessage);
  assert.equal(db.prepare("SELECT reply_to_id FROM support_messages WHERE ticket_id='B' AND actor_id='operator'").get().reply_to_id,bobMessage);
  update(12,303,'/menu');await work();await drain();
  assert.equal(db.prepare("SELECT COUNT(*) n FROM support_telegram_messages WHERE message_id IN (700,701)").get().n,2,'menu navigation removed support mappings');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM telegram_deliveries WHERE event_key IN ('support:alice','support:bob') AND state='sent'").get().n,2);
  assert.ok(!calls.some(c=>c.method==='deleteMessages'&&c.body.chat_id==='303'&&c.body.message_ids.some(id=>[700,701].includes(id))),'support notification deleted');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM telegram_updates WHERE state='failed'").get().n,0);
  update(13,101,'/bantuan');await work();await drain();
  const supportMenu=calls.findLast(c=>c.method==='sendMessage'&&c.body.chat_id==='101'&&c.body.reply_markup?.inline_keyboard.flat().some(b=>b.text.startsWith('A ·')));
  callback(14,101,supportMenu,supportMenu.body.reply_markup.inline_keyboard.flat().find(b=>b.text.startsWith('A ·')).text);
  await work();await drain();
  const history=calls.findLast(c=>c.method==='sendMessage'&&c.body.chat_id==='101'&&c.body.text.includes('Balasan untuk Alice')&&c.body.reply_markup?.inline_keyboard.flat().some(b=>b.text==='Riwayat lengkap'));
  assert.ok(history,'ticket history was not delivered');
  update(15,101,'/menu');await work();await drain();
  assert.equal(db.prepare('SELECT state FROM telegram_deliveries WHERE chat_id=? AND message_id=?').get('101',history.message_id).state,'sent','ticket history deleted on menu navigation');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM telegram_deliveries WHERE event_key LIKE 'support:%' AND chat_id IN ('101','202') AND state='sent'").get().n,2,'customer support notification removed');
  db.prepare('DELETE FROM telegram_runtime').run();
  holdChat='202';
  const started=once(api,'held',{signal:AbortSignal.timeout(20000)});
  update(20,202,'/menu');
  const inFlight=work();
  await started;
  update(21,202,'/saldo');await work();
  const lateId=held.result.message_id;
  held.res.end(JSON.stringify({ok:true,result:held.result}));held=null;
  await inFlight;
  assert.ok(db.prepare("SELECT payload_json FROM telegram_deliveries WHERE method='deleteMessages' AND chat_id='202'").all().some(r=>JSON.parse(r.payload_json).message_ids.includes(lateId)),'late in-flight delivery not queued for cleanup');
  await drain();
  assert.ok(calls.some(c=>c.method==='deleteMessages'&&c.body.chat_id==='202'&&c.body.message_ids.includes(lateId)),'late menu cleanup did not survive worker restart');
  assert.equal(db.prepare('SELECT state FROM telegram_deliveries WHERE chat_id=? AND message_id=?').get('202',lateId).state,'deleted');
  db.prepare('DELETE FROM telegram_runtime').run();
  db.prepare("INSERT INTO telegram_deliveries(event_key,customer_id,chat_id,generation,method,payload_json,available_at) VALUES('rate','alice','101','generation-alice','sendMessage','{\"text\":\"rate check\"}',?)").run(Date.now());
  failure=429;await work();
  const rate=db.prepare("SELECT * FROM telegram_deliveries WHERE event_key='rate'").get();
  assert.equal(rate.state,'pending');assert.ok(rate.available_at>Date.now());
  db.prepare('DELETE FROM telegram_runtime').run();db.prepare("UPDATE telegram_deliveries SET available_at=0 WHERE event_key='rate'").run();failure=403;await work();
  assert.equal(db.prepare("SELECT blocked FROM telegram_links WHERE customer_id='alice'").get().blocked,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM payments').get().n,0);
  console.log('PASS: menu deletion HTTP, pending cancellation, late cleanup and restart, callback isolation, support preservation, financial confirmation, 429 delay and blocked bot');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{held?.res.destroy();db?.close();api.close();fs.rmSync(dir,{recursive:true,force:true});});
