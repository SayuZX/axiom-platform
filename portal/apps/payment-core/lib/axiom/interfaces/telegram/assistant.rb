# frozen_string_literal: true
require_relative '../../application/identity/telegram_identity'
require_relative '../../application/identity/secure_actions'
require_relative '../../application/support/support'
require_relative '../../infrastructure/persistence/admin_store'
require_relative '../../infrastructure/persistence/operations_store'
require_relative '../../application/ledger/reports'
module Axiom
  class Assistant
    def initialize(db,config)
      @db=db;@config=config;@identity=TelegramIdentity.new(db,ENV['TELEGRAM_BOT_USERNAME']);@store=@identity.store
      @payments=Payments.new(db,config);@withdrawals=Withdrawals.new(db);@actions=ActionStore.new(db);@support=Support.new(db);@admin=AdminStore.new(db)
    end
    def button(actor,text,action,resource=nil)
      {text:text,callback_data:@identity.callback(actor['customer_id'],action,resource)}
    end
    def send_text(actor,text,buttons=[],key:nil,ticket_id:nil,message_id:nil,preserve:false)
      @store.enqueue(chat_id:actor['chat_id'],customer_id:actor['customer_id'],generation:actor['generation'],method:'sendMessage',payload:{text:text,reply_markup:{inline_keyboard:buttons}},event_key:key,ticket_id:ticket_id,support_message_id:message_id,menu_revision:preserve ? nil : actor['menu_revision'],admin_required:admin?(actor))
    end
    def controls(actor)
      [[button(actor,'Kembali','menu'),button(actor,'Batal','cancel')]]
    end
    def admin?(actor)
      actor['role']=='admin' && ENV.fetch('TELEGRAM_ADMIN_IDS','').split(',').map(&:strip).include?(actor['user_id'])
    end
    def user(actor) = {'id'=>actor['customer_id'],'role'=>admin?(actor) ? 'admin' : 'customer','username'=>actor['username']}
    def process(update)
      callback=update['callback_query'];message=callback ? callback['message'] : update['message']
      return unless message.is_a?(Hash) && message.dig('chat','type')=='private'
      sender=callback ? callback['from'] : message['from'];return unless sender && !sender['is_bot']
      uid=sender['id'].to_s;chat=message.dig('chat','id').to_s;return unless uid==chat
      if callback
        actor=@store.actor(uid,chat)
        row=actor && @identity.consume_callback(callback['data'],uid)
        @store.enqueue(chat_id:chat,method:'answerCallbackQuery',payload:{callback_query_id:callback['id'],text:row ? 'Permintaan diterima.' : 'Tombol kedaluwarsa atau sudah dipakai. Buka /menu.'},event_key:"callback-answer:#{update['update_id']}")
        return unless row
        actor=actor.merge('menu_revision'=>@store.begin_menu(chat))
        dispatch(actor,row['action'],row['resource'],menu_revision:actor['menu_revision'])
        @actions.audit(user(actor),row['action'],row['resource'],'handled','telegram',uid) if admin?(actor)
        return
      end
      text=(message['text'] || message['caption']).to_s.strip
      if update['_link_token_hash'] || text.start_with?('/start ')
        if update['_link_token_hash']
          @identity.claim_hash(update['_link_token_hash'],uid,chat,[sender['first_name'],sender['last_name']].compact.join(' '))
        else
          @identity.claim(text.split(' ',2).last,uid,chat,[sender['first_name'],sender['last_name']].compact.join(' '))
        end
        @store.enqueue(chat_id:chat,method:'sendMessage',payload:{text:"Permintaan penautan diterima. Kembali ke halaman Telegram pada akun web dan cocokkan ID #{uid} sebelum mengonfirmasi. Tautan belum aktif."},menu_revision:@store.begin_menu(chat),event_key:"link-claim:#{update['update_id']}")
        return
      end
      actor=@store.actor(uid,chat)
      if update.key?('_received_generation') && actor && (update['_received_generation']!=actor['generation'] || update['_received_customer_id']!=actor['customer_id'])
        send_text(actor,'Pesan lama tidak dijalankan karena tautan akun berubah. Buka /menu untuk memulai lagi.',controls(actor));return
      end
      unless actor
        @store.enqueue(chat_id:chat,method:'sendMessage',payload:{text:"Mulai penautan dari akun web: #{@config.origin}/dashboard/telegram\nJangan kirim kata sandi, OTP, atau kunci rahasia API ke bot."},menu_revision:@store.begin_menu(chat),event_key:"unlinked:#{update['update_id']}");return
      end
      conversation=@store.conversation(actor['customer_id'])
      if !text.start_with?('/') && !message['reply_to_message'] && conversation && %w[payment_review withdraw_review admin_status_review].include?(conversation['step'])
        send_text(actor,'Gunakan tombol Konfirmasi pada rincian sebelumnya atau batalkan langkah yang aktif.',controls(actor),preserve:true);return
      end
      actor=actor.merge('menu_revision'=>@store.begin_menu(chat))
      if message.dig('reply_to_message','message_id') && admin?(actor)
        mapping=@support.store.mapped_reply(chat,message['reply_to_message']['message_id'])
        if mapping && mapping['generation']==actor['generation']
          internal=conversation && conversation['step']=='internal_note'
          raise Error.new(409,'Catatan internal harus membalas tiket yang dipilih.') if internal && conversation['payload']['id']!=mapping['ticket_id']
          @support.reply(user(actor),mapping['ticket_id'],{'message'=>text.empty? ? 'Lampiran diterima; periksa halaman akun web.' : text,'attachment'=>message['_attachment'],'reply_to_id'=>mapping['support_message_id'],'internal'=>!!internal},channel:'telegram')
          @store.cancel(actor['customer_id'])
          @actions.audit(user(actor),internal ? 'support.internal-note' : 'support.reply',mapping['ticket_id'],'success','telegram',uid)
          send_text(actor,internal ? "Catatan internal disimpan untuk #{mapping['ticket_id']}." : "Balasan tercatat untuk #{mapping['ticket_id']}. Balas pesan tiket atau pilih tiket sebelum mengirim pesan berikutnya.",controls(actor),preserve:true);return
        end
        @store.cancel(actor['customer_id'])
        send_text(actor,'Balasan tidak terhubung ke tiket aktif. Pilih tiket yang benar; pesan ini tidak diteruskan.',controls(actor));return
      end
      if text.start_with?('/')
        command,arg=text.split(/\s+/,2);command=command.split('@').first
        commands={'/start'=>'menu','/menu'=>'menu','/saldo'=>'balance','/buat'=>'create','/transaksi'=>'payments','/tarik'=>'withdraw','/penarikan'=>'withdrawals','/rekap'=>'report','/apikey'=>'keys','/notifikasi'=>'preferences','/bantuan'=>'support','/kebijakan'=>'policies','/akun'=>'account','/putus'=>'unlink','/admin'=>'admin','/batal'=>'cancel'}
        dispatch(actor,commands.fetch(command,'menu'),arg,menu_revision:actor['menu_revision'])
        @actions.audit(user(actor),command,nil,'handled','telegram',uid) if admin?(actor)
        return
      end
      unless conversation
        send_text(actor,'Pilih menu untuk memulai.',[[button(actor,'Menu utama','menu'),button(actor,'Hubungi pengelola','support_new')]]);return
      end
      case conversation['step']
      when 'payment_amount'
        amount=@payments.amount(text,1)
        fees=@payments.new_fees(amount)
        review={'amount'=>amount,'review_id'=>Axiom.token}
        @store.converse(actor['customer_id'],'payment_review',review)
        send_text(actor,"Periksa invoice\nBruto: Rp#{amount}\nKomisi (2%, dibulatkan ke bawah): Rp#{fees[:fee_amount]}\nNeto: Rp#{fees[:net_amount]}\nKonfirmasi akhir memerlukan kata sandi pada halaman web aman.",[[button(actor,'Konfirmasi','payment_confirm',review['review_id'])],*controls(actor)])
      when 'payment_search'
        @store.cancel(actor['customer_id']);dispatch(actor,'payments',JSON.generate({'search'=>text[0,120]}),menu_revision:actor['menu_revision'])
      when 'withdraw_amount'
        amount=Integer(text,exception:false);raise Error.new(400,'Nominal harus rupiah bulat positif.') unless amount && amount>0 && amount<=9007199254740991 && text.match?(/\A\d+\z/)
        account=@actions.account(actor['customer_id']);raise Error.new(409,'Rekening belum terverifikasi. Buka halaman akun.') unless account && account['status']=='VERIFIED'
        payload=account.slice('bank_name','account_number','account_holder').merge('amount'=>amount,'review_id'=>Axiom.token)
        @store.converse(actor['customer_id'],'withdraw_review',payload)
        send_text(actor,"Periksa penarikan\nRp#{amount}\n#{account['bank_name']} ••••#{account['account_number'][-4,4]}\nEstimasi 1–2 hari kalender. Konfirmasi akhir melalui web aman.",[[button(actor,'Konfirmasi','withdraw_confirm',payload['review_id'])],*controls(actor)])
      when 'support_new'
        body={'subject'=>text[0,160].empty? ? 'Lampiran bantuan' : text[0,160],'message'=>text.empty? ? 'Lampiran bantuan pelanggan.' : text,'attachment'=>message['_attachment']}
        ticket=@support.create(user(actor),body,channel:'telegram');@store.converse(actor['customer_id'],'support_reply',{'id'=>ticket['id']})
        send_text(actor,"Tiket #{ticket['id']} dibuat. Pesan masuk antrean pemeriksaan.#{hours_notice}",[[button(actor,'Tutup tiket','ticket_close',ticket['id'])],*controls(actor)],preserve:true)
      when 'support_reply'
        id=conversation['payload']['id'];@support.reply(user(actor),id,{'message'=>text.empty? ? 'Lampiran bantuan.' : text,'attachment'=>message['_attachment']},channel:'telegram');send_text(actor,"Pesan tercatat pada #{id}. Balasan pengelola akan dikirim ke percakapan ini.#{hours_notice}",controls(actor),preserve:true)
        @actions.audit(user(actor),'support.reply',id,'success','telegram',uid) if admin?(actor)
      when 'quiet_hours'
        raise Error.new(400,'Masukkan dua jam WIB, contoh 22 7, atau off.') unless text=='off' || text.match?(/\A\d{1,2} \d{1,2}\z/)
        start,finish=text=='off' ? [nil,nil] : text.split.map(&:to_i)
        @identity.preferences(actor['customer_id'],{'quiet_start'=>start,'quiet_end'=>finish});@store.cancel(actor['customer_id']);dispatch(actor,'preferences',menu_revision:actor['menu_revision'])
      when 'admin_status_reason','admin_status_reference','internal_note'
        raise Error.new(403,'Akses admin Telegram tidak diizinkan.') unless admin?(actor)
        target=conversation['payload']['id']
        if conversation['step']=='internal_note'
          @support.reply(user(actor),target,{'message'=>text,'internal'=>true},channel:'telegram');@store.cancel(actor['customer_id']);send_text(actor,'Catatan internal disimpan; tidak dikirim ke pelanggan.',controls(actor),preserve:true)
          @actions.audit(user(actor),'support.internal-note',target,'success','telegram',uid)
        else
          payload={'id'=>target,'status'=>conversation['step']=='admin_status_reason' ? 'REJECTED' : 'PAID','review_id'=>Axiom.token}
          if payload['status']=='REJECTED';payload['rejection_reason']=@withdrawals.text(text,'Alasan penolakan',5,500)
          else;payload['transfer_reference']=@withdrawals.text(text,'Referensi transfer',5,120);payload['confirm_transferred']=true;end
          @store.converse(actor['customer_id'],'admin_status_review',payload)
          send_text(actor,"Periksa perubahan #{payload['status']} untuk #{target}.\n#{text}\nPAID hanya sah setelah transfer nyata. Konfirmasi akhir melalui web aman.",[[button(actor,'Konfirmasi','admin_status_confirm',payload['review_id'])],*controls(actor)])
        end
      else
        send_text(actor,'Gunakan tombol konfirmasi atau batalkan langkah yang aktif.',controls(actor))
      end
    rescue Error=>e
      if actor
        @actions.audit(user(actor),callback ? 'callback' : 'message',nil,"rejected:#{e.status}",'telegram',uid) if admin?(actor)
        send_text(actor,e.message,controls(actor))
      else
        @store.enqueue(chat_id:chat,method:'sendMessage',payload:{text:e.message},event_key:"error:#{update['update_id']}") if chat
      end
    end
    def hours_notice
      hours=ENV['SUPPORT_SERVICE_HOURS'];hours ? "\nJam layanan: #{hours}. Di luar jam layanan, pesan menunggu pemeriksaan." : "\nJadwal layanan belum tersedia. Waktu balasan belum dapat dipastikan."
    end
    def dispatch(actor,action,resource=nil,menu_revision:nil)
      actor=actor.merge('menu_revision'=>menu_revision || @store.begin_menu(actor['chat_id']))
      id=actor['customer_id']
      current=@store.conversation(id)
      @store.cancel(id) if current && %w[support_reply support_new internal_note].include?(current['step'])
      case action
      when 'menu','cancel'
        @store.cancel(id)
        buttons=[[%w[Saldo balance],%w[Buat\ invoice create]],[%w[Transaksi payments],%w[Penarikan withdrawals]],[%w[Ajukan\ penarikan withdraw],%w[Rekap report]],[%w[API\ key keys],%w[Notifikasi preferences]],[%w[Bantuan support],%w[Kebijakan policies]],[%w[Akun account]]].map{|row|row.map{|label,cmd|button(actor,label,cmd)}}
        buttons<<[button(actor,'Menu admin','admin')] if admin?(actor)
        send_text(actor,"Menu utama\nAkun: #{actor['username']}\nPilih layanan yang diperlukan. Tindakan keuangan memerlukan konfirmasi pada akun web.",buttons)
      when 'balance'
        w=@withdrawals.store.wallet(id);send_text(actor,"Saldo akun\nTersedia: Rp#{w['available_amount']}\nDicadangkan: Rp#{w['reserved_amount']}\nNeto terbayar: Rp#{w['earned_amount']}\nPenarikan selesai: Rp#{w['paid_out_amount']}\nSaldo berdasarkan catatan transaksi, bukan saldo bank penyedia pembayaran.",controls(actor))
      when 'create'
        @store.converse(id,'payment_amount');send_text(actor,'Masukkan nominal invoice Rp1–Rp10.000.000 dalam Rupiah bulat. Komisi 2%, dibulatkan ke bawah ke Rupiah penuh tanpa minimum biaya, dipotong dari bruto setelah PAID. Pembeli hanya membayar bruto.',controls(actor))
      when 'payment_confirm','withdraw_confirm'
        conversation=@store.conversation(id);expected=action=='payment_confirm' ? 'payment_review' : 'withdraw_review'
        raise Error.new(409,'Langkah kedaluwarsa atau rincian sudah berubah. Mulai kembali.') unless conversation && conversation['step']==expected && resource && conversation['payload']['review_id']==resource
        kind=action=='payment_confirm' ? 'payment' : 'withdrawal';action_id=@actions.draft(id,kind,conversation['payload'],actor['generation']);@store.cancel(id)
        send_text(actor,'Draf tersimpan. Periksa rincian dan konfirmasikan dengan kata sandi pada halaman akun web. Jangan kirim kata sandi ke percakapan ini.',[[{text:'Konfirmasi melalui web',url:"#{@config.origin}/dashboard/konfirmasi/#{action_id}"}],*controls(actor)])
      when 'payment_search'
        @store.converse(id,'payment_search');send_text(actor,'Ketik referensi transaksi yang ingin dicari.',controls(actor))
      when 'payments'
        options=resource&.start_with?('{') ? JSON.parse(resource) : {};offset=options.fetch('offset',0).to_i;status=options.fetch('status','all');search=options.fetch('search','')
        rows,total=@payments.store.page(customer_id:id,status:status,search:search,limit:5,offset:offset)
        buttons=rows.map{|r|[button(actor,"Rp#{r['amount']} · #{r['status']} · #{r['trx_id'][-8,8]}",'payment',r['id'])]}
        buttons<<[button(actor,'Muat Berikutnya','payments',JSON.generate(options.merge('offset'=>offset+5)))] if offset+5<total
        buttons<<[button(actor,'Cari referensi','payment_search'),button(actor,'Terbayar','payments','{"status":"PAID"}'),button(actor,'Menunggu','payments','{"status":"PENDING"}')]
        send_text(actor,"Transaksi Anda: #{total}. Pilih invoice untuk rincian.",buttons+controls(actor))
      when 'payment','payment_check'
        row=@payments.owned(resource,customer_id:id)
        OperationsStore.new(@db).request_payment_check(row['id']) if action=='payment_check' && row['status']!='PAID'
        data=@payments.view(row)
        send_text(actor,"Invoice #{row['trx_id']}\nStatus tercatat: #{row['status']}\nBruto: Rp#{row['amount']}\nKomisi: Rp#{row['fee_amount']}\nNeto: Rp#{row['amount']-row['fee_amount']}\nBatas: #{Axiom.iso(row['expires_at'])}#{action=='payment_check' ? "\nPemeriksaan dijadwalkan. Pemberitahuan akan dikirim jika status berubah." : ''}",[[{text:'Salin tautan',copy_text:{text:data['qr_url']}},button(actor,'Periksa status','payment_check',row['id'])],*controls(actor)])
        if row['status']=='PENDING'&&!row['qr'].empty?&&row['provider_id']&&row['expires_at']>Axiom.now
          @store.enqueue(chat_id:actor['chat_id'],customer_id:id,generation:actor['generation'],method:'sendPhoto',payload:{photo:"#{@config.origin}/api/qr-image/#{row['id']}",caption:"QRIS #{row['trx_id']} — Rp#{row['amount']}"},menu_revision:actor['menu_revision'])
        end
      when 'withdraw'
        account=@actions.account(id)
        unless account && account['status']=='VERIFIED'
          send_text(actor,'Tambahkan rekening melalui halaman aman. Administrator harus memverifikasi rekening sebelum digunakan di Telegram.',[[{text:'Kelola rekening',url:"#{@config.origin}/dashboard/akun"}],*controls(actor)]);return
        end
        @store.converse(id,'withdraw_amount');send_text(actor,"Masukkan nominal penarikan. Tujuan #{account['bank_name']} ••••#{account['account_number'][-4,4]}.",controls(actor))
      when 'withdrawals'
        offset=resource.to_i;rows,total=@withdrawals.store.page(customer_id:id,status:'all',limit:5,offset:offset)
        buttons=rows.map{|r|[button(actor,"Rp#{r['amount']} · #{r['status']}",'withdrawal',r['id'])]};buttons<<[button(actor,'Muat Berikutnya','withdrawals',(offset+5).to_s)] if offset+5<total
        send_text(actor,"Riwayat penarikan: #{total}.",buttons+controls(actor))
      when 'withdrawal'
        r=@withdrawals.detail(resource,customer_id:id)[:withdrawal]
        send_text(actor,"Penarikan #{r['id']}\nRp#{r['amount']} · #{r['status']}\n#{r['bank_name']} ••••#{r['account_number'][-4,4]}\n#{r['rejection_reason']}\nReferensi transfer: #{r['transfer_reference'] || 'belum tersedia'}",controls(actor))
      when 'report','report_daily','report_monthly'
        period=action=='report_daily' ? 'daily' : 'monthly'
        report=Reports.new(@db).read(id,period);totals=report[:totals]
        send_text(actor,"Rekap #{period=='daily' ? 'hari ini' : 'bulan ini'} (invoice dibuat, WIB)\nTerbayar: #{totals['count']}\nBruto: Rp#{totals['gross_amount']}\nKomisi: Rp#{totals['fee_amount']}\nNeto: Rp#{totals['net_amount']}",[[button(actor,'Harian','report_daily'),button(actor,'Bulanan','report_monthly')],[{text:'Unduh laporan akun',url:"#{@config.origin}/api/reports?period=#{period}"}],*controls(actor)])
      when 'keys'
        keys=AuthStore.new(@db).keys(id);text=keys.map{|k|"#{k['name']}: #{k['prefix']}… (#{k['revoked_at'] ? 'dicabut' : 'aktif'})"}.join("\n")
        send_text(actor,"Kunci API\n#{text.empty? ? 'Belum ada kunci API.' : text}\nKunci rahasia tidak dikirim melalui bot.",[[{text:'Kelola kunci API',url:"#{@config.origin}/dashboard/kunci-api"}],*controls(actor)])
      when 'preferences'
        pref=@store.preferences(id)
        buttons=%w[telegram_enabled payments withdrawals support security].map{|key|[button(actor,"#{ {'telegram_enabled'=>'Aktivasi Telegram','payments'=>'Transaksi','withdrawals'=>'Penarikan','support'=>'Bantuan','security'=>'Keamanan'}[key]}: #{pref[key]==1 ? 'aktif' : 'nonaktif'}",'preference_toggle',key)]}
        buttons<<[button(actor,'Harian','digest','daily'),button(actor,'Bulanan','digest','monthly'),button(actor,'Tanpa rekap','digest','off')]
        buttons<<[button(actor,'Atur jam tenang','quiet')]
        send_text(actor,"Preferensi notifikasi. Ringkasan: #{pref['digest']}; jam tenang #{pref['quiet_start'] || '—'}–#{pref['quiet_end'] || '—'} WIB. Ini bukan persetujuan pemasaran.",buttons+controls(actor))
      when 'preference_toggle'
        raise Error.new(400,'Preferensi tidak valid.') unless %w[telegram_enabled payments withdrawals support security].include?(resource)
        pref=@store.preferences(id);@identity.preferences(id,{resource=>pref[resource]!=1});dispatch(actor,'preferences',menu_revision:actor['menu_revision'])
      when 'digest'
        @identity.preferences(id,{'digest'=>resource});dispatch(actor,'preferences',menu_revision:actor['menu_revision'])
      when 'quiet'
        @store.converse(id,'quiet_hours');send_text(actor,'Masukkan jam mulai dan akhir WIB (0–23), contoh 22 7. Ketik off untuk mematikan jam tenang.',controls(actor))
      when 'support'
        rows,total=@support.store.page(id,5,0);buttons=rows.map{|t|[button(actor,"#{t['id']} · #{t['status']}",'ticket',t['id'])]}
        send_text(actor,"Bantuan pelanggan\n#{total} tiket.#{hours_notice}",[[button(actor,'Hubungi pengelola','support_new')],*buttons,*controls(actor)])
      when 'support_new'
        @store.converse(id,'support_new');send_text(actor,'Jelaskan kendala Anda. Jangan kirim kata sandi, OTP, kunci rahasia API, atau nomor rekening lengkap. Lampiran PNG/JPEG/PDF maksimal 2 MB. Tangkapan layar bukan bukti pembayaran terverifikasi.',controls(actor))
      when 'ticket','ticket_close','ticket_reopen'
        @support.change_status(user(actor),resource,action=='ticket_close' ? 'CLOSED' : 'OPEN') if action!='ticket'
        detail=@support.detail(user(actor),resource);ticket=detail[:ticket]
        if ticket['status']=='CLOSED';@store.cancel(id)
        else;@store.converse(id,'support_reply',{'id'=>resource});end
        recent=detail[:messages].last(5).map{|m|"#{m['internal']==1 ? '[Internal] ' : ''}#{m['actor_username']}: #{m['body']}"}.join("\n")
        buttons=[[button(actor,ticket['status']=='CLOSED' ? 'Buka kembali' : 'Tutup tiket',ticket['status']=='CLOSED' ? 'ticket_reopen' : 'ticket_close',resource)]]
        buttons<<[button(actor,'Catatan internal','internal_note',resource)] if admin?(actor) && ticket['status']!='CLOSED'
        buttons<<[{text:'Riwayat lengkap',url:"#{@config.origin}/#{admin?(actor) ? 'admin' : 'dashboard'}/bantuan/#{resource}"}]
        send_text(actor,"#{resource} · #{ticket['status']}\n#{recent}",buttons+controls(actor),preserve:true)
      when 'policies'
        routes={'Syarat layanan'=>'terms-of-service','Privasi'=>'privacy-policy','Biaya'=>'fee-policy','Penarikan'=>'withdrawal-policy','Refund'=>'refund-policy','Penggunaan'=>'acceptable-use-policy','Pengaduan'=>'complaint-policy'}
        send_text(actor,'Kebijakan Axiom Payment. Komisi invoice baru 2%, dibulatkan ke bawah ke Rupiah penuh tanpa minimum biaya. Invoice lama mengikuti biaya yang tercatat saat dibuat. Hanya versi yang sudah diterbitkan berlaku.',routes.map{|label,slug|[{text:label,url:"#{@config.origin}/#{slug}"}]}+controls(actor))
      when 'account'
        send_text(actor,"Akun #{actor['username']}\nTelegram ID #{actor['user_id']}\nTautan aktif. Pemulihan akses tersedia melalui web.",[[button(actor,'Putus tautan','unlink')],*controls(actor)])
      when 'unlink'
        send_text(actor,'Putuskan hubungan Telegram? Tombol dan percakapan tertunda akan dibatalkan.',[[button(actor,'Konfirmasi putus','unlink_confirm')],*controls(actor)])
      when 'unlink_confirm'
        @identity.unlink(id);@store.enqueue(chat_id:actor['chat_id'],method:'sendMessage',payload:{text:'Tautan diputus. Tautkan kembali melalui akun web.'},menu_revision:actor['menu_revision'])
      when 'admin_withdrawal','admin_process','admin_reject','admin_paid','admin_status_confirm','internal_note'
        raise Error.new(403,'Akses admin Telegram tidak diizinkan.') unless admin?(actor)
        if action=='admin_status_confirm'
          conversation=@store.conversation(id);raise Error.new(409,'Konfirmasi kedaluwarsa atau rincian berubah.') unless conversation && conversation['step']=='admin_status_review' && resource && conversation['payload']['review_id']==resource
          action_id=@actions.draft(id,'withdrawal_status',conversation['payload'],actor['generation']);@store.cancel(id)
          send_text(actor,'Otorisasi akhir diperlukan. Periksa lagi bukti transfer pada halaman aman.',[[{text:'Otorisasi admin',url:"#{@config.origin}/dashboard/konfirmasi/#{action_id}"}],*controls(actor)])
        elsif action=='internal_note'
          @support.owned(resource,user(actor));@store.converse(id,'internal_note',{'id'=>resource});send_text(actor,'Ketik catatan internal. Catatan ini tidak diteruskan ke pelanggan.',controls(actor))
        else
          row=@withdrawals.detail(resource,admin:true)[:withdrawal]
          if action=='admin_withdrawal'
            actions=[];actions<<button(actor,'Proses','admin_process',resource) if row['status']=='REQUESTED';actions<<button(actor,'Tolak','admin_reject',resource) if %w[REQUESTED PROCESSING].include?(row['status']);actions<<button(actor,'Catat transfer selesai','admin_paid',resource) if row['status']=='PROCESSING'
            send_text(actor,"#{resource}\nRp#{row['amount']} · #{row['status']}\n#{row['bank_name']} ••••#{row['account_number'][-4,4]}\nRekening lengkap hanya pada web aman.",[actions].reject(&:empty?)+controls(actor))
          elsif action=='admin_process'
            raise Error.new(409,'Status penarikan sudah berubah.') unless row['status']=='REQUESTED'
            payload={'id'=>resource,'status'=>'PROCESSING','review_id'=>Axiom.token}
            @store.converse(id,'admin_status_review',payload);send_text(actor,'Pindahkan penarikan ke PROCESSING? Ini belum berarti dana ditransfer.',[[button(actor,'Konfirmasi','admin_status_confirm',payload['review_id'])],*controls(actor)])
          else
            raise Error.new(409,'Status penarikan sudah berubah.') unless action=='admin_paid' ? row['status']=='PROCESSING' : %w[REQUESTED PROCESSING].include?(row['status'])
            @store.converse(id,action=='admin_paid' ? 'admin_status_reference' : 'admin_status_reason',{'id'=>resource});send_text(actor,action=='admin_paid' ? 'Setelah transfer nyata berhasil, masukkan referensi transfer unik. Jangan kirim gambar sebagai pengganti referensi.' : 'Masukkan alasan penolakan yang jelas.',controls(actor))
          end
        end
      when 'admin','admin_overview','admin_payments','admin_customers','admin_withdrawals','admin_commissions','admin_support','admin_alerts'
        raise Error.new(403,'Akses admin Telegram tidak diizinkan.') unless admin?(actor)
        admin_menu(actor,action,resource)
      else
        send_text(actor,'Tindakan tidak dikenal. Buka menu baru.',controls(actor))
      end
    end
    def admin_menu(actor,action,resource)
      options=[['Ringkasan','admin_overview'],['Transaksi','admin_payments'],['Pelanggan','admin_customers'],['Antrean penarikan','admin_withdrawals'],['Komisi','admin_commissions'],['Tiket bantuan','admin_support'],['Peringatan','admin_alerts']]
      if action=='admin'
        send_text(actor,'Administrasi Axiom Payment',options.map{|label,cmd|[button(actor,label,cmd)]}+controls(actor));return
      end
      offset=resource.to_i;buttons=[]
      case action
      when 'admin_overview','admin_commissions'
        t=@admin.overview;text="Ringkasan platform\nPelanggan: #{t['customer_count']}\nBruto: Rp#{t['gross_amount']}\nKomisi diakui: Rp#{t['fee_amount']}\nNeto pelanggan: Rp#{t['net_amount']}\nAntrean: #{t['requested_count']} / Rp#{t['requested_amount']}\nKomisi bukan saldo siap dicairkan."
      when 'admin_payments'
        rows,total=@admin.payments('all','',nil,5,offset);text=rows.map{|r|"#{r['trx_id']} Rp#{r['amount']} #{r['status']}"}.join("\n");buttons<<[button(actor,'Muat Berikutnya',action,(offset+5).to_s)] if offset+5<total
      when 'admin_customers'
        rows,total=@admin.customers('',5,offset);text=rows.map{|r|"#{r['username']} — tersedia Rp#{r['available_amount']}"}.join("\n");buttons<<[button(actor,'Muat Berikutnya',action,(offset+5).to_s)] if offset+5<total
      when 'admin_withdrawals'
        rows,total=@admin.withdrawals('all',nil,5,offset);text='Pilih penarikan untuk meninjau tujuan dan mengotorisasi perubahan status dengan verifikasi tambahan.'
        buttons=rows.map{|r|[button(actor,"#{r['username']} Rp#{r['amount']} #{r['status']}",'admin_withdrawal',r['id'])]};buttons<<[button(actor,'Muat Berikutnya',action,(offset+5).to_s)] if offset+5<total
      when 'admin_support'
        rows,total=@support.store.page(nil,5,offset);text='Tiket pelanggan. Balas pesan tiket yang diteruskan atau pilih tiket berikut.';buttons=rows.map{|r|[button(actor,"#{r['id']} #{r['status']}",'ticket',r['id'])]};buttons<<[button(actor,'Muat Berikutnya',action,(offset+5).to_s)] if offset+5<total
      when 'admin_alerts'
        text='Peringatan pengiriman dan koneksi dapat diperiksa pada halaman operasional. Kegagalan pengiriman tidak mengubah saldo.';buttons=[[{text:'Buka operasional',url:"#{@config.origin}/admin/operasional"}]]
      end
      send_text(actor,text.to_s.empty? ? 'Belum ada data.' : text,buttons+[[button(actor,'Kembali ke admin','admin')]])
    end
  end
end
