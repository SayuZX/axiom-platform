# frozen_string_literal: true
ENV['BUNDLE_GEMFILE'] ||= File.expand_path('../apps/payment-core/Gemfile',__dir__)
require 'bundler/setup'
require_relative '../apps/payment-core/lib/axiom/config'
require_relative '../apps/payment-core/lib/axiom/infrastructure/integrations/telegram_api'
api=Axiom::TelegramAPI.new
abort 'TELEGRAM_MODE=webhook required.' unless api.mode=='webhook'
url=URI(ENV.fetch('PUBLIC_URL'))
abort 'PUBLIC_URL must be HTTPS.' unless url.scheme=='https'
secret=ENV.fetch('TELEGRAM_WEBHOOK_SECRET','')
abort 'Webhook secret must have 32+ permitted characters.' unless secret.match?(/\A[A-Za-z0-9_-]{32,256}\z/)
health_url=url+ '/api/health'
health=Net::HTTP.start(health_url.host,health_url.port,use_ssl:true,open_timeout:10,read_timeout:10) { |http| http.get(health_url.request_uri) }
abort 'Public origin unavailable; webhook unchanged.' unless health.is_a?(Net::HTTPSuccess)
runtime=JSON.parse(health.body)
abort 'Public origin is not the new payment-core; webhook unchanged.' unless runtime['runtime']=='ruby' && runtime['architecture']=='payment-core'
api.verify!
api.call('setWebhook',{url:"#{url.to_s.delete_suffix('/')}/api/telegram/webhook",secret_token:secret,allowed_updates:%w[message callback_query],drop_pending_updates:false})
puts 'Webhook configured. Pending updates preserved; no polling process should run for this bot.'
