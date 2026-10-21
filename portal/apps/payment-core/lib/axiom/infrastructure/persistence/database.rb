# frozen_string_literal: true
require 'sqlite3'
require 'monitor'
require 'securerandom'

module Axiom
  class Database
    def initialize(path)
      @path = path
      @connections = []
      @lock = Monitor.new
      @thread_key = "axiom_sqlite_#{object_id}".to_sym
    end

    def connection
      Thread.current[@thread_key] ||= @lock.synchronize do
        db = SQLite3::Database.new(@path)
        db.results_as_hash = true
        db.busy_timeout = 5000
        db.execute_batch('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
        @connections << db
        db
      end
    end
    def release
      db=Thread.current[@thread_key]
      return unless db
      @lock.synchronize { @connections.delete(db);db.close }
      Thread.current[@thread_key]=nil
    end

    def transaction
      db = connection
      nested=db.transaction_active?
      savepoint="axiom_#{Thread.current.object_id}_#{SecureRandom.hex(4)}" if nested
      db.execute(nested ? "SAVEPOINT #{savepoint}" : 'BEGIN IMMEDIATE')
      begin
        result = yield
        db.execute(nested ? "RELEASE SAVEPOINT #{savepoint}" : 'COMMIT')
        result
      rescue Exception
        if db.transaction_active?
          if nested
            db.execute("ROLLBACK TO SAVEPOINT #{savepoint}");db.execute("RELEASE SAVEPOINT #{savepoint}")
          else
            db.execute('ROLLBACK')
          end
        end
        raise
      end
    end

    def migrate!
      connection.execute_batch(File.read(File.expand_path('../../../../db/migrations/001_legacy.sql',__dir__)))
      transaction do
        add_column('payments', 'customer_id', 'TEXT')
        add_column('payments', 'provider_id', 'TEXT')
        add_column('payments', 'fee_rate_bps', 'INTEGER NOT NULL DEFAULT 0 CHECK(fee_rate_bps BETWEEN 0 AND 10000)')
        add_column('payments', 'fee_amount', 'INTEGER NOT NULL DEFAULT 0 CHECK(fee_amount BETWEEN 0 AND amount)')
        add_column('payments', 'notifications_enabled', 'INTEGER NOT NULL DEFAULT 0')
        unless columns('payments').include?('fee_policy')
          add_column('payments', 'fee_policy', "TEXT NOT NULL DEFAULT 'legacy_zero'")
          connection.execute("UPDATE payments SET fee_policy=CASE WHEN fee_rate_bps=100 THEN 'percentage_100bps' WHEN fee_rate_bps=0 AND fee_amount=0 THEN 'legacy_zero' ELSE 'legacy_snapshot' END")
        end
        add_column('customers', 'role', "TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin'))")
        add_column('customers','max_active_api_keys','INTEGER NOT NULL DEFAULT 10 CHECK(typeof(max_active_api_keys) = \'integer\' AND max_active_api_keys BETWEEN 0 AND 100)')
        add_column('customer_keys','deleted_at','INTEGER CHECK(deleted_at IS NULL OR revoked_at IS NOT NULL)')
        connection.execute_batch(<<~SQL)
          CREATE UNIQUE INDEX IF NOT EXISTS payment_provider ON payments(provider_id) WHERE provider_id IS NOT NULL;
          CREATE INDEX IF NOT EXISTS payment_customer ON payments(customer_id,created_at);
          CREATE TABLE IF NOT EXISTS email_outbox (
            id INTEGER PRIMARY KEY, event_key TEXT NOT NULL UNIQUE,
            customer_id TEXT NOT NULL, recipient TEXT NOT NULL, payload_json TEXT NOT NULL,
            state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','failed')),
            attempts INTEGER NOT NULL DEFAULT 0, available_at INTEGER NOT NULL,
            lease_until INTEGER, lease_token TEXT, accepted_at INTEGER, error_class TEXT,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS outbox_pending ON email_outbox(state,available_at);
        SQL
        connection.execute_batch(File.read(File.expand_path('../../../../db/migrations/002_channels.sql',__dir__)))
        add_column('telegram_updates','lease_token','TEXT')
        add_column('verified_accounts','revision',"TEXT NOT NULL DEFAULT 'legacy'")
        add_column('payments','provider_terminal','INTEGER NOT NULL DEFAULT 0')
        add_column('telegram_deliveries','admin_required','INTEGER NOT NULL DEFAULT 0')
        add_column('telegram_updates','next_attempt_at','INTEGER NOT NULL DEFAULT 0')
        add_column('secure_actions','claimed_at','INTEGER')
        add_column('support_messages','reply_to_id','INTEGER REFERENCES support_messages(id)')
        connection.execute_batch(File.read(File.expand_path('../../../../db/migrations/003_support_chat.sql',__dir__)))
        add_column('telegram_deliveries','menu_revision','INTEGER')
        connection.execute_batch(File.read(File.expand_path('../../../../db/migrations/004_menu_navigation.sql',__dir__)))
      end
    end

    def close
      @lock.synchronize { @connections.each(&:close); @connections.clear }
      Thread.current[@thread_key] = nil
    end

    private

    def columns(table) = connection.execute("PRAGMA table_info(#{table})").map { |row| row['name'] }
    def add_column(table, name, type)
      connection.execute("ALTER TABLE #{table} ADD COLUMN #{name} #{type}") unless columns(table).include?(name)
    end
  end
end
