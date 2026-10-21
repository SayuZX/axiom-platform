PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, trx_id TEXT UNIQUE NOT NULL, amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 10000000),
 qr TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','EXPIRED')), transaction_json TEXT
);
CREATE INDEX IF NOT EXISTS payment_amount ON payments(amount,status,expires_at);
CREATE TABLE IF NOT EXISTS claims (transaction_id TEXT PRIMARY KEY, payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id));
CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customer_sessions (
        token_hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS customer_session_expiry ON customer_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS customer_keys (
        id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, created_at INTEGER NOT NULL,
        last_used_at INTEGER, revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS customer_key_owner ON customer_keys(customer_id,revoked_at);
    CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL,
        password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, otp_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, sent_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0,
        sending INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS registration_expiry ON registrations(expires_at);
    CREATE TABLE IF NOT EXISTS auth_limits (
        id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_limit_expiry ON auth_limits(expires_at);
CREATE TABLE IF NOT EXISTS withdrawals (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 16 AND 100),
        amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount BETWEEN 1 AND 9007199254740991),
        bank_name TEXT NOT NULL CHECK(length(bank_name) BETWEEN 2 AND 80),
        account_number TEXT NOT NULL CHECK(length(account_number) BETWEEN 6 AND 34 AND account_number NOT GLOB '*[^0-9]*'),
        account_holder TEXT NOT NULL CHECK(length(account_holder) BETWEEN 2 AND 120),
        status TEXT NOT NULL CHECK(status IN ('REQUESTED','PROCESSING','PAID','REJECTED')),
        requested_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        estimated_start_at INTEGER NOT NULL, estimated_end_at INTEGER NOT NULL,
        processed_at INTEGER, completed_at INTEGER, rejected_at INTEGER,
        transfer_reference TEXT, rejection_reason TEXT,
        UNIQUE(customer_id,request_id),
        CHECK(estimated_start_at=requested_at+86400000 AND estimated_end_at=requested_at+172800000),
        CHECK(updated_at>=requested_at),
        CHECK((status='REQUESTED' AND processed_at IS NULL AND completed_at IS NULL AND rejected_at IS NULL)
            OR (status='PROCESSING' AND processed_at IS NOT NULL AND completed_at IS NULL AND rejected_at IS NULL)
            OR (status='PAID' AND processed_at IS NOT NULL AND completed_at IS NOT NULL AND rejected_at IS NULL)
            OR (status='REJECTED' AND completed_at IS NULL AND rejected_at IS NOT NULL)),
        CHECK((status='PAID' AND transfer_reference IS NOT NULL AND length(transfer_reference) BETWEEN 5 AND 120)
            OR (status<>'PAID' AND transfer_reference IS NULL)),
        CHECK((status='REJECTED' AND rejection_reason IS NOT NULL AND length(rejection_reason) BETWEEN 5 AND 500)
            OR (status<>'REJECTED' AND rejection_reason IS NULL))
    );
    CREATE INDEX IF NOT EXISTS withdrawal_owner ON withdrawals(customer_id,requested_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS withdrawal_queue ON withdrawals(status,requested_at DESC,id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_transfer_reference ON withdrawals(transfer_reference) WHERE transfer_reference IS NOT NULL;
    CREATE TABLE IF NOT EXISTS withdrawal_events (
        id INTEGER PRIMARY KEY,
        withdrawal_id TEXT NOT NULL REFERENCES withdrawals(id),
        actor_customer_id TEXT NOT NULL REFERENCES customers(id),
        from_status TEXT CHECK(from_status IS NULL OR from_status IN ('REQUESTED','PROCESSING')),
        to_status TEXT NOT NULL CHECK(to_status IN ('REQUESTED','PROCESSING','PAID','REJECTED')),
        created_at INTEGER NOT NULL,
        transfer_reference TEXT, rejection_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS withdrawal_event_history ON withdrawal_events(withdrawal_id,id);
    CREATE TRIGGER IF NOT EXISTS withdrawal_immutable BEFORE UPDATE ON withdrawals
    WHEN OLD.id IS NOT NEW.id OR OLD.customer_id IS NOT NEW.customer_id OR OLD.request_id IS NOT NEW.request_id
        OR OLD.amount IS NOT NEW.amount OR OLD.bank_name IS NOT NEW.bank_name
        OR OLD.account_number IS NOT NEW.account_number OR OLD.account_holder IS NOT NEW.account_holder
        OR OLD.requested_at IS NOT NEW.requested_at OR OLD.estimated_start_at IS NOT NEW.estimated_start_at
        OR OLD.estimated_end_at IS NOT NEW.estimated_end_at
        OR OLD.status IN ('PAID','REJECTED')
        OR NOT ((OLD.status='REQUESTED' AND NEW.status IN ('PROCESSING','REJECTED'))
            OR (OLD.status='PROCESSING' AND NEW.status IN ('PAID','REJECTED')))
    BEGIN SELECT RAISE(ABORT,'immutable withdrawal'); END;
    CREATE TRIGGER IF NOT EXISTS withdrawal_no_delete BEFORE DELETE ON withdrawals
    BEGIN SELECT RAISE(ABORT,'immutable withdrawal'); END;
    CREATE TRIGGER IF NOT EXISTS withdrawal_event_no_update BEFORE UPDATE ON withdrawal_events
    BEGIN SELECT RAISE(ABORT,'immutable withdrawal event'); END;
    CREATE TRIGGER IF NOT EXISTS withdrawal_event_no_delete BEFORE DELETE ON withdrawal_events
    BEGIN SELECT RAISE(ABORT,'immutable withdrawal event'); END;
