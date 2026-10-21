# Start: set AXIOM_CHAT_SECRET_FILE=C:\ProgramData\AxiomAi\Chat\internal.key
#        ruby service.rb
# Stop: Ctrl+C / SIGTERM; service manager must forward termination to Ruby.
# Dependencies: installed sqlite3 and webrick gems (Ruby 4.0.7).
# Only history.sqlite is created/migrated. No customer/billing database is opened.
require 'webrick'
require 'sqlite3'
require 'json'
require 'openssl'
require 'base64'
require 'net/http'
require 'fileutils'

module AxiomChat
  HISTORY_LIMIT = 2 * 1024 * 1024
  CHAT_LIMIT = 8 * 1024 * 1024
  class Failure < StandardError
    attr_reader :status
    def initialize(status, message)
      @status = status
      super(message)
    end
  end


  class Service
    def initialize(secret_file:, db_path: 'C:/ProgramData/AxiomAi/Chat/history.sqlite')
      @secret = File.binread(secret_file)
      raise 'Internal secret must contain exactly 32 raw bytes' unless @secret.bytesize == 32
      FileUtils.mkdir_p(File.dirname(db_path))
      @db = SQLite3::Database.new(db_path)
      @db.busy_timeout = 5000
      @db.execute('PRAGMA journal_mode=WAL')
      @db.execute('PRAGMA synchronous=FULL')
      @db.execute('CREATE TABLE IF NOT EXISTS history (customer_id TEXT PRIMARY KEY, version INTEGER NOT NULL, titles TEXT NOT NULL, content TEXT NOT NULL)')
      @lock = Mutex.new
      @auth_lock = Mutex.new
      @nonces = {}
    end

    def close
      @lock.synchronize { @db.close }
    end

    def parse_json(body)
      JSON.parse(body, max_nesting: 64, allow_duplicate_key: false, allow_nan: false)
    rescue JSON::ParserError, JSON::NestingError, EncodingError
      raise Failure.new(400, 'Invalid JSON')
    end

    def authenticate(encoded, signature)
      valid = encoded.is_a?(String) && encoded.bytesize.between?(1, 8192) && encoded.match?(/\A[A-Za-z0-9_-]+\z/) && signature.is_a?(String) && signature.match?(/\A[0-9a-f]{64}\z/)
      raise Failure.new(401, 'Unauthorized') unless valid
      expected = OpenSSL::HMAC.hexdigest('SHA256', @secret, encoded)
      raise Failure.new(401, 'Unauthorized') unless OpenSSL.fixed_length_secure_compare(expected, signature)
      begin
        identity = parse_json(Base64.urlsafe_decode64(encoded))
      rescue ArgumentError, Failure
        raise Failure.new(401, 'Unauthorized')
      end
      now = (Time.now.to_r * 1000).to_i
      valid = identity.is_a?(Hash) && (identity.keys - %w[customerId keyId key iat nonce]).empty?
      valid &&= identity['customerId'].is_a?(String) && identity['customerId'].bytesize.between?(1, 256) && !identity['customerId'].match?(/[\x00-\x1f\x7f]/)
      valid &&= identity['iat'].is_a?(Integer) && (now - identity['iat']).abs <= 15_000
      valid &&= identity['nonce'].is_a?(String) && identity['nonce'].match?(/\A[A-Za-z0-9_-]{16,128}\z/)
      raise Failure.new(401, 'Unauthorized') unless valid
      @auth_lock.synchronize do
        @nonces.delete_if { |_nonce, expiry| expiry < now }
        raise Failure.new(401, 'Unauthorized') if @nonces.key?(identity['nonce'])
        raise Failure.new(503, 'Authentication capacity exceeded') if @nonces.size >= 100_000
        @nonces[identity['nonce']] = identity['iat'] + 15_000
      end
      identity
    end

    def history(customer)
      @lock.synchronize do
        row = @db.get_first_row('SELECT version, titles, content FROM history WHERE customer_id = ?', [customer])
        row ? {'version' => row[0], 'titles' => JSON.parse(row[1]), 'content' => JSON.parse(row[2])} : {'version' => 0, 'titles' => [], 'content' => {}}
      end
    end

    def save_history(customer, payload)
      valid = payload.is_a?(Hash) && payload.keys.sort == %w[content expectedVersion titles]
      valid &&= payload['expectedVersion'].is_a?(Integer) && payload['expectedVersion'].between?(0, 9_007_199_254_740_990)
      valid &&= payload['titles'].is_a?(Array) && payload['titles'].all? { |title| title.is_a?(String) }
      valid &&= payload['content'].is_a?(Hash) && payload['content'].values.all? { |messages| messages.is_a?(Array) && messages.all? { |message| message.is_a?(Hash) } }
      raise Failure.new(400, 'Invalid history document') unless valid
      raise Failure.new(413, 'History too large') if JSON.generate(payload).bytesize > HISTORY_LIMIT
      titles, content = JSON.generate(payload['titles']), JSON.generate(payload['content'])
      @lock.synchronize do
        @db.transaction(:immediate) do
          current = @db.get_first_value('SELECT version FROM history WHERE customer_id = ?', [customer]) || 0
          raise Failure.new(409, 'History version conflict') unless current == payload['expectedVersion']
          @db.execute('INSERT INTO history(customer_id,version,titles,content) VALUES(?,?,?,?) ON CONFLICT(customer_id) DO UPDATE SET version=excluded.version,titles=excluded.titles,content=excluded.content', [customer, current + 1, titles, content])
        end
      end
      {'version' => payload['expectedVersion'] + 1}
    end

    def json_response(response, status, value)
      response.status = status
      response['Content-Type'] = 'application/json; charset=utf-8'
      response.body = JSON.generate(value)
    end

    def request_json(request, limit)
      raise Failure.new(415, 'Content-Type must be application/json') unless request['content-type'].to_s.split(';').first.to_s.strip.downcase == 'application/json'
      raise Failure.new(415, 'Content encoding not supported') if request['content-encoding'] && request['content-encoding'] != 'identity'
      raise Failure.new(413, 'Request too large') if request['content-length'].to_i > limit
      body = +''
      request.body do |chunk|
        raise Failure.new(413, 'Request too large') if body.bytesize + chunk.bytesize > limit
        body << chunk
      end
      [parse_json(body), body]
    end

    def proxy_chat(request, response, identity)
      unless identity['keyId'].is_a?(String) && identity['keyId'].bytesize.between?(1, 256) && identity['key'].is_a?(String) && identity['key'].match?(/\A[\x21-\x7e]{1,4096}\z/)
        raise Failure.new(401, 'Chat credentials required')
      end
      payload, raw = request_json(request, CHAT_LIMIT)
      valid = payload.is_a?(Hash) && payload['model'].is_a?(String) && payload['model'].bytesize.between?(1, 512) && payload['messages'].is_a?(Array) && !payload['messages'].empty? && payload['messages'].all? { |message| message.is_a?(Hash) && message['role'].is_a?(String) }
      valid &&= !payload.key?('stream') || [true, false].include?(payload['stream'])
      raise Failure.new(400, 'Invalid chat request') unless valid
      headers = Queue.new
      chunks = SizedQueue.new(2)
      worker = Thread.new do
        delivered_headers = false
        begin
          # Explicit nil disables proxy environment variables; never follow redirects.
          http = Net::HTTP.new('127.0.0.1', 20128, nil)
          http.open_timeout = 10
          http.read_timeout = 60
          http.write_timeout = 30
          http.max_retries = 0
          upstream = Net::HTTP::Post.new('/v1/chat/completions')
          upstream['Authorization'] = "Bearer #{identity['key']}"
          upstream['Content-Type'] = 'application/json'
          upstream['Accept'] = payload['stream'] ? 'text/event-stream' : 'application/json'
          upstream['Accept-Encoding'] = 'identity'
          upstream.body = raw
          http.start do
            http.request(upstream) do |result|
              headers << [result.code.to_i, result['content-type'] || 'application/json', result['retry-after']]
              delivered_headers = true
              result.read_body { |chunk| chunks << [:data, chunk] }
            end
          end
          chunks << [:done, nil]
        rescue Net::OpenTimeout, Net::ReadTimeout, Net::WriteTimeout
          delivered_headers ? chunks << [:error, nil] : headers << [504, nil, nil]
        rescue StandardError
          delivered_headers ? chunks << [:error, nil] : headers << [502, nil, nil]
        end
      end
      worker.report_on_exception = false
      status, content_type, retry_after = headers.pop
      unless content_type
        worker.join
        raise Failure.new(status, 'Router unavailable')
      end
      response.status = status
      response['Content-Type'] = content_type
      response['Retry-After'] = retry_after if retry_after
      response['X-Accel-Buffering'] = 'no'
      response.chunked = true
      response.body = proc do |output|
        begin
          loop do
            kind, chunk = chunks.pop
            break if kind == :done
            raise IOError, 'Router stream interrupted' if kind == :error
            output.write(chunk)
          end
        ensure
          # A downstream write failure cancels the producer; Net::HTTP closes its socket.
          worker.kill if worker.alive?
          worker.join
        end
      end
    rescue Exception
      worker&.kill
      worker&.join
      raise
    end

    def call(request, response)
      response['Cache-Control'] = 'private, no-store'
      response['X-Content-Type-Options'] = 'nosniff'
      if request.path == '/health' && request.request_method == 'GET'
        return json_response(response, 200, {'ok' => true})
      end
      identity = authenticate(request['x-axiom-identity'], request['x-axiom-signature'])
      case [request.request_method, request.path]
      when ['GET', '/history'], ['PUT', '/history']
        raise Failure.new(401, 'History identity must not include credentials') if identity.key?('key') || identity.key?('keyId')
        result = request.request_method == 'GET' ? history(identity['customerId']) : save_history(identity['customerId'], request_json(request, HISTORY_LIMIT).first)
        json_response(response, 200, result)
      when ['POST', '/v1/chat/completions']
        proxy_chat(request, response, identity)
      else
        json_response(response, 404, {'error' => {'message' => 'Not found'}})
      end
    rescue Failure => e
      json_response(response, e.status, {'error' => {'message' => e.message}})
    rescue SQLite3::BusyException
      json_response(response, 503, {'error' => {'message' => 'History temporarily busy'}})
    rescue StandardError
      json_response(response, 500, {'error' => {'message' => 'Internal service error'}})
    end
  end

  class Endpoint < WEBrick::HTTPServlet::AbstractServlet
    def service(request, response)
      @options.first.call(request, response)
    end
  end
end

if $PROGRAM_NAME == __FILE__
  service = AxiomChat::Service.new(secret_file: ENV.fetch('AXIOM_CHAT_SECRET_FILE'), db_path: ENV.fetch('AXIOM_CHAT_DB_PATH', 'C:/ProgramData/AxiomAi/Chat/history.sqlite'))
  # Disable WEBrick exception/access logging: upstream data and credentials stay private.
  server = WEBrick::HTTPServer.new(BindAddress: '127.0.0.1', Port: 3090, AccessLog: [], Logger: WEBrick::Log.new(File::NULL), RequestTimeout: 30, MaxClients: 64)
  server.mount('/', AxiomChat::Endpoint, service)
  %w[INT TERM].each { |signal| trap(signal) { server.shutdown } }
  begin
    server.start
  ensure
    service.close
  end
end
