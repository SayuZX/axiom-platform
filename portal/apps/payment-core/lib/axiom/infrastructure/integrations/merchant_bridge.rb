# frozen_string_literal: true
require 'net/http'

module Axiom
  class MerchantBridge
    def initialize(config)
      @config = config
    end

    def request(endpoint, body=nil)
      connection = @config.merchant
      raise Error.new(503, 'Koneksi merchant utama belum tersedia.') unless connection
      url = @config.bridge + endpoint
      client = Net::HTTP.new(url.hostname, url.port, nil)
      client.open_timeout = 10
      client.read_timeout = 25
      client.write_timeout = 25
      request = body ? Net::HTTP::Post.new(url) : Net::HTTP::Get.new(url)
      request['x-api-key'] = connection['key']
      request['Content-Type'] = 'application/json'
      request.body = JSON.generate(body) if body
      response = client.start { |http| http.request(request) }
      unless response.is_a?(Net::HTTPSuccess)
        raise Error.new(503, 'Provider pembayaran belum dapat diakses. Periksa status sebelum membuat pembayaran lain.')
      end
      data = JSON.parse(response.body)
      raise Error.new(502, 'Respons provider tidak valid.') unless data.is_a?(Hash)
      data
    rescue JSON::ParserError, IOError, SystemCallError, Timeout::Error, SocketError, Net::ProtocolError
      raise Error.new(503, 'Provider pembayaran belum dapat diakses. Periksa status sebelum membuat pembayaran lain.')
    end
  end
end
