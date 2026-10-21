# frozen_string_literal: true
require 'json'
require 'uri'
require 'time'
require 'digest'
require 'securerandom'
require 'openssl'
require 'fileutils'
require 'ipaddr'
require 'dotenv/load'

module Axiom
  class Error < StandardError
    attr_reader :status, :code
    def initialize(status, message, code: nil)
      super(message)
      @status, @code = status, code
    end
  end

  def self.now = (Time.now.to_r * 1000).to_i
  def self.iso(value) = value && Time.at(Rational(value, 1000)).utc.iso8601(3)
  def self.token = SecureRandom.urlsafe_base64(32, false)
  def self.digest(value) = Digest::SHA256.hexdigest(value)
  def self.equal_secret(a, b)
    a.is_a?(String) && b.is_a?(String) && a.bytesize == b.bytesize && OpenSSL.fixed_length_secure_compare(a, b)
  end

  class Config
    attr_reader :origin, :data_dir, :api_key, :bridge, :merchant_id, :connection_file
    def initialize(env = ENV)
      @origin = env.fetch('PUBLIC_URL', 'http://127.0.0.1:3084').delete_suffix('/')
      url = URI(@origin)
      loopback = %w[localhost 127.0.0.1 ::1].include?(url.hostname)
      raise 'PUBLIC_URL harus origin HTTPS atau localhost.' unless url.host && !url.userinfo && ['','/'].include?(url.path) && !url.query && !url.fragment && (url.scheme == 'https' || (url.scheme == 'http' && loopback))
      @api_key = env.fetch('API_KEY', '')
      raise 'API_KEY harus memiliki sedikitnya 32 karakter acak.' if @api_key.length < 32
      data_path=env.fetch('DATA_DIR','')
      raise 'DATA_DIR wajib berupa path absolut agar tidak membuat ledger baru akibat working directory.' unless data_path.start_with?('/') || data_path.match?(/\A[A-Za-z]:[\\\/]/)
      @data_dir = File.expand_path(data_path)
      @bridge = URI(env.fetch('MERCHANT_BRIDGE_URL', 'http://127.0.0.1:3082'))
      raise 'Merchant bridge harus loopback lokal.' unless @bridge.scheme == 'http' && %w[127.0.0.1 ::1].include?(@bridge.hostname) && !@bridge.userinfo && !@bridge.query && !@bridge.fragment
      @merchant_id = env.fetch('GOPAY_MERCHANT_ID', '')
      @connection_file = env.fetch('MERCHANT_CONNECTION_FILE', File.join(@data_dir, '..', 'merchant-connection.json'))
      FileUtils.mkdir_p(@data_dir, mode: 0700)
    end
    def secure? = @origin.start_with?('https:')
    def merchant
      row = JSON.parse(File.read(@connection_file))
      return nil unless row['key'].is_a?(String) && row['key'].length >= 20 && !@merchant_id.empty? && row['merchant_id'] == @merchant_id
      row
    rescue SystemCallError, JSON::ParserError
      nil
    end
  end
end
