# frozen_string_literal: true
require 'net/smtp'
require 'base64'
module Axiom
  class MailDelivery
    attr_reader :last_error
    def initialize(env=ENV)
      @host=env.fetch('SMTP_HOST','').strip; @port=Integer(env.fetch('SMTP_PORT','587'),exception:false)
      @from=env.fetch('SMTP_FROM','').strip; @user=env.fetch('SMTP_USER',''); @password=env.fetch('SMTP_PASSWORD','')
      @secure=env.fetch('SMTP_SECURE',@port==465 ? 'true' : 'false')
      @servername=env['SMTP_SERVERNAME']; @test=env['RACK_ENV']=='test' && %w[localhost 127.0.0.1 ::1].include?(@host)
      @enabled=env['EMAIL_DELIVERY_ENABLED']!='false' && !@host.empty? && !@host.match?(/[\s\/]/) && @port && @port.between?(1,65535) && !@from.empty? && @from.length<=320 && !@from.match?(/[\r\n]/) && (@user.empty? == @password.empty?) && %w[true false].include?(@secure)
    end
    def configured? = !!@enabled
    def deliver(to:, subject:, text:, message_id:)
      raise Error.new(503,'Verifikasi email belum tersedia. Hubungi pengelola.') unless configured?
      raise Error.new(400,'Alamat email tidak valid.') if [to,subject,message_id].any? { |v| !v.is_a?(String) || v.match?(/[\r\n]/) }
      smtp=Net::SMTP.new(@host,@port)
      smtp.open_timeout=10; smtp.read_timeout=20
      context=OpenSSL::SSL::SSLContext.new
      context.set_params(min_version:OpenSSL::SSL::TLS1_2_VERSION,verify_mode:OpenSSL::SSL::VERIFY_PEER)
      smtp.tls_hostname=@servername if @servername && !@servername.empty?
      if @secure=='true'
        smtp.enable_tls(context)
      elsif !@test
        smtp.enable_starttls(context)
      end
      encoded_subject="=?UTF-8?B?#{Base64.strict_encode64(subject)}?="
      body=Base64.encode64(text.encode('UTF-8')).gsub("\n","\r\n")
      message="From: #{@from}\r\nTo: #{to}\r\nSubject: #{encoded_subject}\r\nMessage-ID: <#{message_id}>\r\nDate: #{Time.now.rfc2822}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n#{body}"
      envelope=@from[/<([^>]+)>/,1] || @from
      smtp.start('localhost',@user.empty? ? nil : @user,@password.empty? ? nil : @password,@user.empty? ? nil : :plain) { |s| s.send_message(message,envelope,to) }
      @last_error=nil
      true
    rescue Error
      raise
    rescue StandardError => e
      @last_error=e.class.name
      warn "SMTP delivery failed: #{@last_error}"
      raise Error.new(503,'Email belum dapat dikirim. Coba lagi nanti atau hubungi pengelola.')
    end
  end
end
