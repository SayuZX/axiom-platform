-- MariaDB customer accounts, independent of merchant and native administrator identities.
-- Apply after merchant-bridge.sql. Existing guest checkouts remain unclaimed.
CREATE TABLE IF NOT EXISTS bridge_customers (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  name VARCHAR(100) NOT NULL,
  password_salt CHAR(32) NOT NULL,
  password_hash CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY bridge_customers_email (email)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_cs;

-- Apply before deploying registration changes; safe to rerun. Never backfill acceptance.
-- Acknowledges service terms and the privacy notice, not optional data processing.
ALTER TABLE bridge_customers
  ADD COLUMN IF NOT EXISTS legal_accepted_at DATETIME(6) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS legal_document_version VARCHAR(40) NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS bridge_customer_sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  INDEX bridge_customer_sessions_customer (customer_id),
  INDEX bridge_customer_sessions_expiry (expires_at),
  CONSTRAINT bridge_customer_sessions_customer_fk FOREIGN KEY (customer_id)
    REFERENCES bridge_customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_cs;

ALTER TABLE bridge_checkout
  MODIFY COLUMN token_hash CHAR(64) NULL,
  ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_cs NULL,
  ADD INDEX IF NOT EXISTS bridge_checkout_customer (customer_id, created_at);

SET @customer_fk_sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'bridge_checkout'
      AND CONSTRAINT_NAME = 'bridge_checkout_customer_fk' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ),
  'SELECT 1',
  'ALTER TABLE bridge_checkout ADD CONSTRAINT bridge_checkout_customer_fk FOREIGN KEY (customer_id) REFERENCES bridge_customers(id)'
);
PREPARE customer_fk_statement FROM @customer_fk_sql;
EXECUTE customer_fk_statement;
DEALLOCATE PREPARE customer_fk_statement;
