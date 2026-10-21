# frozen_string_literal: true
require 'net/http'
require 'stringio'
module Axiom
  class TelegramAPI
    class DeliveryError < StandardError
      attr_reader :code,:retry_after
      def initialize(code,retry_after=nil)
        super("Telegram API error #{code}");@code=code;@retry_after=retry_after
      end
    end
    attr_reader :username,:mode
    def initialize(env=ENV)
      @token=env['TELEGRAM_BOT_TOKEN'];@username=env['TELEGRAM_BOT_USERNAME'];@mode=env.fetch('TELEGRAM_MODE','disabled')
      raise 'TELEGRAM_MODE harus disabled, webhook, atau polling.' unless %w[disabled webhook polling].include?(@mode)
      raise 'Long polling hanya untuk pengembangan.' if @mode=='polling' && env['RACK_ENV']=='production'
      @base='https://api.telegram.org'
      @base=env['TELEGRAM_TEST_URL'] if env['RACK_ENV']=='test' && env['TELEGRAM_TEST_URL']&.match?(/\Ahttp:\/\/127\.0\.0\.1:\d+\z/)
    end
    def configured? = @mode!='disabled' && @token&.match?(/\A\d+:[A-Za-z0-9_-]+\z/) && @username&.match?(/\A[A-Za-z0-9_]{5,32}\z/)
    def call(method,payload={},photo:nil)
      raise DeliveryError.new(503) unless configured?
      raise ArgumentError,'Telegram method invalid' unless %w[getMe getWebhookInfo setWebhook deleteWebhook getUpdates sendMessage sendPhoto sendDocument deleteMessages answerCallbackQuery getFile].include?(method)
      uri=URI("#{@base}/bot#{@token}/#{method}");client=Net::HTTP.new(uri.host,uri.port,nil);client.use_ssl=uri.scheme=='https';client.open_timeout=10;client.read_timeout=35;client.write_timeout=20
      request=Net::HTTP::Post.new(uri)
      if photo
        raise ArgumentError,'Photo attachment requires sendPhoto' unless method=='sendPhoto'
        fields=payload.map{|key,value|[key.to_s,value.is_a?(String) ? value : JSON.generate(value)]}
        request.set_form(fields+[['photo',StringIO.new(photo),{filename:'axiom-receipt.png',content_type:'image/png'}]],'multipart/form-data')
      else
        request['Content-Type']='application/json';request.body=JSON.generate(payload)
      end
      response=client.start{|http|http.request(request)};value=JSON.parse(response.body)
      raise DeliveryError.new(value['error_code']||response.code.to_i,value.dig('parameters','retry_after')) unless response.is_a?(Net::HTTPSuccess) && value['ok']==true
      value['result']
    rescue JSON::ParserError,IOError,SystemCallError,Timeout::Error,SocketError,OpenSSL::SSL::SSLError,Net::HTTPBadResponse,Net::ProtocolError
      raise DeliveryError.new(503)
    end
    def verify!
      identity=call('getMe');raise 'Username bot tidak cocok dengan konfigurasi.' unless identity['is_bot'] && identity['username'].to_s.casecmp?(@username)
      hook=call('getWebhookInfo')
      raise 'Webhook aktif; polling tidak boleh dijalankan bersamaan.' if @mode=='polling' && !hook['url'].to_s.empty?
      identity
    end
    def attachment(file_id)
      metadata=call('getFile',{file_id:file_id})
      raise Error.new(400,'Lampiran maksimal 2 MB.') if !metadata['file_size'].is_a?(Integer) || metadata['file_size']>2097152
      file_path=metadata['file_path'];raise Error.new(400,'Path lampiran tidak valid.') unless file_path.is_a?(String) && file_path.match?(/\A[a-zA-Z0-9_\-\/\.]+\z/) && !file_path.include?('..')
      uri=URI("#{@base}/file/bot#{@token}/#{file_path}");data=''.b
      Net::HTTP.start(uri.host,uri.port,use_ssl:uri.scheme=='https',open_timeout:10,read_timeout:20) do |http|
        http.request(Net::HTTP::Get.new(uri)) do |response|
          raise Error.new(503,'Lampiran Telegram belum dapat diambil.') unless response.is_a?(Net::HTTPSuccess)
          response.read_body{|chunk|data<<chunk;raise Error.new(400,'Lampiran maksimal 2 MB.') if data.bytesize>2097152}
        end
      end
      data
    rescue IOError,SystemCallError,Timeout::Error,SocketError,OpenSSL::SSL::SSLError,Net::HTTPBadResponse,Net::ProtocolError
      raise DeliveryError.new(503)
    end
  end
end
