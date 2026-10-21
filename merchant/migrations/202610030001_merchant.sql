-- Fresh isolated merchant database; all money below is integer Indonesian rupiah.
-- Existing untrusted source tables must not be imported without reconciliation.
CREATE TABLE users (
 id VARCHAR(36) PRIMARY KEY,
 email VARCHAR(254) NOT NULL UNIQUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE activation_tokens (
 id VARCHAR(36) PRIMARY KEY,
 token VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 email VARCHAR(254) NOT NULL,
 is_used BOOLEAN NOT NULL DEFAULT FALSE,
 expires_at DATETIME NOT NULL,
 used_by_user_id VARCHAR(36) NULL,
 used_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT activation_user FOREIGN KEY (used_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE api_keys (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 api_key_hash VARCHAR(100) NOT NULL,
 key_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
 encrypted_api_key TEXT NOT NULL,
 name VARCHAR(100) NOT NULL DEFAULT 'Default',
 rate_limit_per_minute INT NOT NULL DEFAULT 60,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 expires_at DATETIME NULL,
 last_used_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT api_key_user FOREIGN KEY (user_id) REFERENCES users(id),
 CHECK (rate_limit_per_minute > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE device_info (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL UNIQUE,
 device_id VARCHAR(255) NOT NULL,
 device_os VARCHAR(255) NOT NULL,
 phone_make VARCHAR(255) NOT NULL,
 phone_model VARCHAR(255) NOT NULL,
 device_fingerprint TEXT NOT NULL,
 fcm_token TEXT NULL,
 transaction_id VARCHAR(255) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT device_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE gopay_tokens (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL UNIQUE,
 gopay_email VARCHAR(254) NOT NULL,
 gopay_phone VARCHAR(64) NOT NULL,
 gopay_account_id VARCHAR(255) NOT NULL,
 merchant_id VARCHAR(255) NULL,
 access_token MEDIUMTEXT NOT NULL,
 refresh_token MEDIUMTEXT NULL,
 cookies MEDIUMTEXT NULL,
 expires_at DATETIME NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT gopay_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE payment_orders (
 order_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 merchant_id VARCHAR(255) NOT NULL,
 pop_id VARCHAR(64) NOT NULL,
 transaction_id VARCHAR(255) NULL UNIQUE,
 amount BIGINT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending',
 qr_string TEXT NULL,
 qr_image_url TEXT NULL,
 expires_at VARCHAR(64) NULL,
 last_checked_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY user_history (user_id,created_at),
 KEY pending_poll (status,last_checked_at),
 CONSTRAINT order_user FOREIGN KEY (user_id) REFERENCES users(id),
 CHECK (amount BETWEEN 1 AND 10000000),
 CHECK (status IN ('pending','settlement','cancel','expire','deny','failure'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE webhooks (
 id VARCHAR(36) PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 url VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 events JSON NOT NULL,
 encrypted_api_key TEXT NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY webhook_destination (user_id,url),
 CONSTRAINT webhook_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE webhook_outbox (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 webhook_id VARCHAR(36) NOT NULL,
 event_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload MEDIUMTEXT NOT NULL,
 attempts INT NOT NULL DEFAULT 0,
 next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 delivered_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY event_destination (webhook_id,event_id),
 KEY retry_due (delivered_at,next_attempt_at),
 CONSTRAINT outbox_webhook FOREIGN KEY (webhook_id) REFERENCES webhooks(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
