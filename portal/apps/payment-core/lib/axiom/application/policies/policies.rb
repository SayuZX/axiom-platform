# frozen_string_literal: true
require 'date'
require_relative 'content'
require_relative '../../infrastructure/persistence/policy_store'
module Axiom
  class Policies
    REQUIRED = %w[operator_name support_hours withdrawal_schedule retention_accounts retention_financial retention_support retention_logs version effective_at updated_at].freeze
    attr_reader :store

    def initialize(db, env=ENV)
      @store = PolicyStore.new(db)
      @configuration = {}
      file = env['POLICY_CONFIG_FILE']
      if file && !file.empty?
        parsed = JSON.parse(File.read(file))
        raise 'POLICY_CONFIG_FILE harus objek JSON.' unless parsed.is_a?(Hash)
        @configuration = parsed
      end
      @enabled = env['POLICIES_PUBLISHED'] == 'true'
      if published?
        PolicyContent::TITLES.each_key { |slug| store.archive(document(slug)) }
        store.announce(@configuration['version'],@configuration['effective_at'])
      end
    rescue JSON::ParserError
      raise 'POLICY_CONFIG_FILE tidak valid.'
    end

    def missing
      fields = REQUIRED.reject { |key| @configuration[key].is_a?(String) && !@configuration[key].strip.empty? }
      fields << 'version' unless @configuration['version'].to_s.match?(/\A[A-Za-z0-9._-]{1,80}\z/)
      %w[contact_email privacy_email].each{|key|value=@configuration[key];fields<<key unless value.nil? || value=='' || (value.is_a?(String) && value.match?(/\A[^\s@]+@[^\s@]+\.[^\s@]+\z/))}
      %w[effective_at updated_at].each do |key|
        next if fields.include?(key)
        begin
          Date.iso8601(@configuration[key])
        rescue ArgumentError
          fields << key
        end
      end
      fields
    end

    def published?
      @enabled && missing.empty?
    end

    def current
      active=published? ? store.active('terms-of-service',Time.now.getlocal('+07:00').strftime('%Y-%m-%d')) : nil
      { published:published?,active:!!active,version:active && active['version'],effective_at:active && active['effective_at'],announced_version:published? ? @configuration['version'] : nil,announced_effective_at:published? ? @configuration['effective_at'] : nil,documents:PolicyContent::TITLES.map{|slug,title|{slug:slug,title:title}} }
    end

    def document(slug, draft:false, version:nil)
      raise Error.new(404,'Kebijakan tidak ditemukan.') unless PolicyContent::TITLES.key?(slug)
      if version
        archived = store.get(slug,version)
        raise Error.new(404,'Versi tidak ditemukan.') unless archived
        return {slug:slug,title:archived['title'],version:version,effective_at:archived['effective_at'],updated_at:archived['updated_at'],published:true,sections:JSON.parse(archived['content_json'])}
      end
      raise Error.new(503,'Kebijakan belum diterbitkan atau konfigurasi belum lengkap.') unless draft || published?
      config = @configuration.dup
      REQUIRED.each { |key| config[key] = "[PERLU DILENGKAPI: #{key}]" if config[key].to_s.empty? } if draft
      {slug:slug,title:PolicyContent::TITLES[slug],version:config['version'],effective_at:config['effective_at'],updated_at:config['updated_at'],published:published?,missing:draft ? missing : [],sections:PolicyContent.sections(slug,config).each_with_index.map { |(heading,text),index| {id:"bagian-#{index+1}",heading:heading,text:text} }}
    end

    def validate_registration(body)
      version=current[:version]
      raise Error.new(503,'Registrasi menunggu syarat layanan yang berlaku.') unless version
      raise Error.new(400,'Persetujuan syarat layanan versi aktif diperlukan.') unless body['accept_tos'] == true && body['tos_version'] == version
      version
    end
  end
end
