# frozen_string_literal: true
ENV['BUNDLE_GEMFILE'] ||= File.expand_path('../../../../Gemfile',__dir__)
require 'bundler/setup'
require 'sinatra/base'
require 'rackup'
require 'rackup/handler/webrick'
require_relative '../../config'
require_relative '../../infrastructure/persistence/database'
require_relative '../../application/identity/auth'

module Axiom
  class App < Sinatra::Base
    configure do
      set :show_exceptions, false
      set :raise_errors, false
      set :protection, false
      set :host_authorization, {permitted_hosts: []}
      set :config, Config.new
      database=Database.new(File.join(settings.config.data_dir,'payments.sqlite')); database.migrate!
      set :database, database
      set :auth_service, Auth.new(database,settings.config)
      set :activity_log, [{timestamp:Axiom.iso(Axiom.now),type:'SYSTEM',message:'Axiom payment-core started.'}]
      set :activity_mutex, Mutex.new
    end
    after do
      settings.database.release
    end
    before do
      content_type :json
      headers 'Cache-Control'=>'no-store','X-Content-Type-Options'=>'nosniff','Referrer-Policy'=>'no-referrer','X-Frame-Options'=>'DENY'
      @body_limit=request.path.match?(%r{\A/api/(admin/)?support(?:/|$)}) ? 2810000 : request.path=='/api/telegram/webhook' ? 262144 : 16384
      if request.content_length.to_i>@body_limit
        raise Error.new(413,'Isi permintaan terlalu besar.')
      end
    end
    helpers do
      def answer(data={},status_code=200)
        status status_code
        JSON.generate({success:true}.merge(data))
      end
      def request_data
        return @request_data if @request_data
        raw=request.body.read(@body_limit+1)
        raise Error.new(413,'Isi permintaan terlalu besar.') if raw.bytesize>@body_limit
        @request_data=JSON.parse(raw.empty? ? '{}' : raw)
        raise Error.new(400,'Isi permintaan JSON tidak valid.') unless @request_data.is_a?(Hash)
        @request_data
      rescue JSON::ParserError
        raise Error.new(400,'Isi permintaan JSON tidak valid.')
      end
      def session_token = request.cookies['axiom_session']
      def mutation?
        !%w[GET HEAD OPTIONS].include?(request.request_method)
      end
      def same_origin!
        raise Error.new(403,'Permintaan harus berasal dari halaman Axiom Payment yang sah.') unless request.env['HTTP_ORIGIN']==settings.config.origin && request.env['HTTP_X_AXIOM_REQUEST']=='1' && request.media_type=='application/json'
      end
      def session!
        @user=settings.auth_service.session(session_token)
        raise Error.new(401,'Silakan masuk ke akun Anda.') unless @user
        same_origin! if mutation?
        @user
      end
      def admin!
        session!
        raise Error.new(403,'Akses administrator diperlukan.') unless @user['role']=='admin'
        @user
      end
      def customer!
        key=request.env['HTTP_X_API_KEY']
        if key && Axiom.equal_secret(key,settings.config.api_key)
          @master=true; return nil
        end
        @user=settings.auth_service.customer(api_key:key,token:session_token)
        same_origin! if !key && mutation?
        @user
      end
      def set_session(token)
        response.set_cookie('axiom_session',value:token,path:'/',httponly:true,secure:settings.config.secure?,same_site: :lax,max_age:604800)
      end
      def client_ip
        peer=request.env['REMOTE_ADDR'] || 'unknown'
        return peer unless %w[127.0.0.1 ::1].include?(peer)
        candidate=ENV['TUNNEL_ONLY']=='true' ? request.env['HTTP_CF_CONNECTING_IP'] : request.env.fetch('HTTP_X_FORWARDED_FOR',peer).split(',').last&.strip
        begin
          IPAddr.new(candidate.to_s).to_s
        rescue IPAddr::InvalidAddressError
          peer
        end
      end
    end
    get('/health') { answer(status:'OK',service:'Axiom Payment',runtime:'ruby',architecture:'payment-core') }
    get('/api/health') { answer(status:'OK',service:'Axiom Payment',runtime:'ruby',architecture:'payment-core') }
    get('/api/auth/config') do
      policy=settings.policies.current
      answer(data:{registration_available:settings.auth_service.mail.configured? && policy[:active],otp_expiry_seconds:600,merchant_mode:'shared',tos_version:policy[:version],policies_published:policy[:published]})
    end
    post('/api/auth/register') do
      same_origin!
      version=settings.policies.validate_registration(request_data)
      registration=settings.auth_service.register(request_data,client_ip,tos_version:version)
      answer({data:registration},202)
    end
    post('/api/auth/resend') { same_origin!; answer({data:settings.auth_service.resend(request_data,client_ip)},202) }
    post('/api/auth/verify') do
      same_origin!; user,token=settings.auth_service.verify(request_data,client_ip); set_session(token); answer({data:{user:user}},201)
    end
    post('/api/auth/login') do
      same_origin!; user,token=settings.auth_service.login(request_data,client_ip,session_token); set_session(token); answer(data:{user:user})
    end
    post('/api/auth/logout') do
      same_origin!; settings.auth_service.store.logout(session_token) if session_token
      response.delete_cookie('axiom_session',path:'/',secure:settings.config.secure?,httponly:true,same_site: :lax); answer
    end
    get('/api/me') { answer(data:{user:session!}) }
    get('/api/keys') do
      id=session!['id'];answer(data:{keys:settings.auth_service.keys(id),usage:settings.auth_service.store.key_usage(id)})
    end
    post('/api/keys') do
      session!;settings.secure_actions.verify_password(@user,request_data['password'])
      answer({data:settings.auth_service.create_key(@user['id'],request_data)},201)
    end
    delete('/api/keys/:id') { settings.auth_service.store.revoke(params['id'],session!['id']); answer }
    post('/api/keys/:id/remove') { settings.auth_service.store.remove_key(params['id'],session!['id']); answer }
    error Axiom::Error do
      error=env['sinatra.error']; status error.status
      if error.status>=500
        settings.activity_mutex.synchronize do
          settings.activity_log.unshift({timestamp:Axiom.iso(Axiom.now),type:'ERROR',message:"HTTP #{error.status}: #{error.class}"})
          settings.activity_log.pop while settings.activity_log.length>100
        end
      end
      JSON.generate({success:false,message:error.message}.merge(error.code ? {code:error.code} : {}))
    end
    error do
      warn "API failure: #{env['sinatra.error'].class}"
      settings.activity_mutex.synchronize do
        settings.activity_log.unshift({timestamp:Axiom.iso(Axiom.now),type:'ERROR',message:"Internal failure: #{env['sinatra.error'].class}"})
        settings.activity_log.pop while settings.activity_log.length>100
      end
      status 500; JSON.generate(success:false,message:'Layanan mengalami gangguan. Coba lagi nanti.')
    end
    not_found { status 404; JSON.generate(success:false,message:'Endpoint tidak ditemukan.') }
  end
end

%w[payments withdrawals admin channels policies operations receipts].each { |file| require_relative file }
