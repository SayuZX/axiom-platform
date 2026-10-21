# Run: ruby service_test.rb (sqlite3 and webrick gems required)
require 'tmpdir'
require 'stringio'
require_relative 'service'

def assert(value, message = 'assertion failed')
  raise message unless value
end

def rejects(status)
  yield
  raise 'expected rejection'
rescue AxiomChat::Failure => e
  assert(e.status == status, "expected #{status}, got #{e.status}")
end

Dir.mktmpdir do |dir|
  secret = 's' * 32
  File.binwrite(File.join(dir, 'key'), secret)
  service = AxiomChat::Service.new(secret_file: File.join(dir, 'key'), db_path: File.join(dir, 'chat.sqlite'))
  sign = lambda do |identity|
    encoded = Base64.urlsafe_encode64(JSON.generate(identity), padding: false)
    [encoded, OpenSSL::HMAC.hexdigest('SHA256', secret, encoded)]
  end
  identity = {customerId: 'alice', iat: (Time.now.to_r * 1000).to_i, nonce: 'nonce-12345678901234567890'}
  encoded, signature = sign.call(identity)
  assert(service.authenticate(encoded, signature)['customerId'] == 'alice')
  rejects(401) { service.authenticate(encoded, signature) } # replay
  rejects(401) { service.authenticate(encoded, '0' * 64) }
  encoded, signature = sign.call(identity.merge(iat: (Time.now.to_r * 1000).to_i - 16_000, nonce: 'expired-12345678901234567'))
  rejects(401) { service.authenticate(encoded, signature) }
  encoded, signature = sign.call(identity.merge(iat: (Time.now.to_r * 1000).to_i + 16_000, nonce: 'future-123456789012345678'))
  rejects(401) { service.authenticate(encoded, signature) }
  rejects(400) { service.parse_json('{"model":"a","model":"b"}') }
  rejects(400) { service.parse_json('{') }
  assert(service.history('alice') == {'version' => 0, 'titles' => [], 'content' => {}})
  payload = {'expectedVersion' => 0, 'titles' => ['one'], 'content' => {'one' => [{'role' => 'user', 'content' => 'secret'}]}}
  assert(service.save_history('alice', payload) == {'version' => 1})
  assert(service.history('alice')['content'] == payload['content'])
  assert(service.history('bob')['content'] == {})
  rejects(409) { service.save_history('alice', payload) }
  rejects(400) { service.save_history('alice', payload.merge('expectedVersion' => -1)) }
  rejects(400) { service.save_history('alice', payload.merge('content' => 'bad')) }
  rejects(400) { service.save_history('alice', payload.merge('customerId' => 'bob')) }
  rejects(413) { service.save_history('alice', payload.merge('titles' => ['x' * AxiomChat::HISTORY_LIMIT])) }
  request_class = Struct.new(:request_method, :path, :headers, :raw) do
    def [](name) = headers[name]
    def body
      yield raw if raw
    end
  end
  response = WEBrick::HTTPResponse.new(WEBrick::Config::HTTP)
  service.call(request_class.new('GET', '/history', {}, nil), response)
  assert(response.status == 401)
  assert(response['Cache-Control'] == 'private, no-store')
  response = WEBrick::HTTPResponse.new(WEBrick::Config::HTTP)
  service.call(request_class.new('GET', '/health', {}, nil), response)
  assert(response.status == 200)
  rejects(413) do
    service.request_json(request_class.new('PUT', '/history', {'content-type' => 'application/json'}, ' ' * (AxiomChat::HISTORY_LIMIT + 1)), AxiomChat::HISTORY_LIMIT)
  end
  rejects(415) do
    service.request_json(request_class.new('PUT', '/history', {'content-type' => 'text/plain'}, '{}'), AxiomChat::HISTORY_LIMIT)
  end
  rejects(401) do
    service.proxy_chat(request_class.new('POST', '/v1/chat/completions', {}, nil), response, {'customerId' => 'alice'})
  end
  results = Queue.new
  threads = 2.times.map do
    Thread.new do
      begin
        service.save_history('alice', payload.merge('expectedVersion' => 1))
        results << 200
      rescue AxiomChat::Failure => e
        results << e.status
      end
    end
  end
  threads.each(&:join)
  assert(2.times.map { results.pop }.sort == [200, 409], 'CAS must have one winner')
  assert(service.history('alice')['version'] == 2)
  service.close
end
puts 'Focused authentication/history checks passed'
