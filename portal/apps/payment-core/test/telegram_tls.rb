# frozen_string_literal: true
ENV['BUNDLE_GEMFILE']=File.expand_path('../Gemfile',__dir__)
require 'bundler/setup'
require 'socket'
require_relative '../lib/axiom/config'
require_relative '../lib/axiom/infrastructure/integrations/telegram_api'
server=TCPServer.new('127.0.0.1',0)
thread=Thread.new do
  socket=server.accept
  socket.write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
  socket.close
end
api=Axiom::TelegramAPI.new({'TELEGRAM_MODE'=>'webhook','TELEGRAM_BOT_TOKEN'=>'123:fixture','TELEGRAM_BOT_USERNAME'=>'axiom_fixture_bot'})
# Test-only endpoint injection: a real TCP server deliberately violates TLS.
api.instance_variable_set(:@base,"https://127.0.0.1:#{server.addr[1]}")
begin
  api.call('getMe')
  raise 'invalid TLS accepted'
rescue Axiom::TelegramAPI::DeliveryError=>e
  raise 'TLS not normalized as temporary transport failure' unless e.code==503
ensure
  thread.join
  server.close
end
puts 'PASS: real TLS failure stays a channel-local delivery error'
