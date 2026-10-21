-- Dedicated schema owned by AXIOM AI, separate from the supplied merchant core tables.
CREATE TABLE IF NOT EXISTS bridge_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  payload_encrypted MEDIUMTEXT NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX bridge_sessions_expiry (expires_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS bridge_settings (
  name VARCHAR(64) PRIMARY KEY,
  value_encrypted MEDIUMTEXT NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS bridge_checkout (
  id CHAR(36) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  email VARCHAR(254) NOT NULL,
  package_id VARCHAR(128) NOT NULL,
  package_snapshot JSON NOT NULL,
  merchant_user_id VARCHAR(36) NOT NULL,
  merchant_key_encrypted TEXT NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  state VARCHAR(24) NOT NULL DEFAULT 'creating',
  payment_json JSON NULL,
  api_key_id VARCHAR(128) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  paid_at DATETIME(6) NULL,
  INDEX bridge_checkout_state (state, updated_at)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS bridge_webhook_events (
  event_id VARCHAR(128) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS bridge_rate_limits (
  bucket_key CHAR(64) PRIMARY KEY,
  hits INT UNSIGNED NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  INDEX bridge_rate_limits_expiry (expires_at)
) ENGINE=InnoDB;
