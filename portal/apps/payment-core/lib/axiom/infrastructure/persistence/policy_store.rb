# frozen_string_literal: true
require_relative 'outbox_store'
module Axiom
  class PolicyStore
    def initialize(db)
      @db = db
    end

    def archive(document)
      json = JSON.generate(document[:sections])
      hash = Axiom.digest(json)
      @db.transaction do
        existing = get(document[:slug], document[:version])
        if existing
          unless existing['content_hash'] == hash && existing['title']==document[:title] && existing['effective_at'] == document[:effective_at] && existing['updated_at'] == document[:updated_at]
            raise Error.new(409, 'Isi versi kebijakan yang sudah diarsipkan tidak boleh diubah.')
          end
          next
        end
        @db.connection.execute('INSERT INTO policy_versions VALUES(?,?,?,?,?,?,?)', [document[:slug], document[:version], document[:title], json, hash, document[:effective_at], document[:updated_at]])
      end
    end

    def get(slug, version)
      @db.connection.get_first_row('SELECT * FROM policy_versions WHERE slug=? AND version=?', [slug, version])
    end

    def active(slug, today)
      @db.connection.get_first_row('SELECT * FROM policy_versions WHERE slug=? AND effective_at<=? ORDER BY effective_at DESC,updated_at DESC LIMIT 1',[slug,today])
    end

    def announce(version,effective_at)
      @db.transaction do
        @db.connection.execute('INSERT OR IGNORE INTO scheduler_runs VALUES(?,?)',["policy-announcement:#{version}",Axiom.now])
        next unless @db.connection.changes==1
        outbox=OutboxStore.new(@db)
        @db.connection.execute('SELECT id FROM customers').each do |customer|
          outbox.enqueue(event_key:"policy:#{version}:#{customer['id']}",customer_id:customer['id'],payload:{kind:'policy',status:'Pembaruan ketentuan',reference:version,id:version,message:"Versi ketentuan #{version} diumumkan, berlaku #{effective_at}. Baca perubahan sebelum tanggal berlaku. Akses penyelesaian kewajiban dan pengaduan tetap tersedia."})
        end
      end
    end

    def consent(customer_id, version, channel)
      raise Error.new(409, 'Versi syarat layanan tidak tersedia.') unless get('terms-of-service', version)
      @db.connection.execute('INSERT OR IGNORE INTO policy_consents VALUES(?,?,?,?,?)', [customer_id, 'terms-of-service', version, Axiom.now, channel])
    end

    def registration(id, version)
      @db.connection.execute('INSERT INTO registration_consents VALUES(?,?,?)', [id, version, Axiom.now])
    end

    def activate(registration_id, customer_id)
      row = @db.connection.get_first_row('SELECT * FROM registration_consents WHERE registration_id=?', [registration_id])
      return unless row
      @db.connection.execute('INSERT OR IGNORE INTO policy_consents VALUES(?,?,?,?,?)', [customer_id, 'terms-of-service', row['version'], row['accepted_at'], 'web_registration'])
      @db.connection.execute('DELETE FROM registration_consents WHERE registration_id=?', [registration_id])
    end
  end
end
