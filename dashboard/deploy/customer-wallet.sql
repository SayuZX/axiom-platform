-- Site credits are integer IDR, spent only on configured token packages.
ALTER TABLE bridge_checkout
 ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'package',
 ADD COLUMN IF NOT EXISTS funding VARCHAR(16) NOT NULL DEFAULT 'qris',
 ADD COLUMN IF NOT EXISTS wallet_credited BOOLEAN NOT NULL DEFAULT FALSE,
 MODIFY COLUMN merchant_user_id VARCHAR(36) NULL,
 MODIFY COLUMN merchant_key_encrypted TEXT NULL;
CREATE TABLE IF NOT EXISTS bridge_wallets (
 customer_id VARCHAR(36) PRIMARY KEY,
 balance BIGINT NOT NULL DEFAULT 0,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT bridge_wallet_customer FOREIGN KEY(customer_id) REFERENCES bridge_customers(id),
 CHECK(balance >= 0 AND balance <= 1000000000000)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_cs;
CREATE TABLE IF NOT EXISTS bridge_wallet_entries (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 customer_id VARCHAR(36) NOT NULL,
 reference VARCHAR(128) NOT NULL UNIQUE,
 kind VARCHAR(16) NOT NULL,
 amount BIGINT NOT NULL,
 balance_after BIGINT NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY wallet_history(customer_id,id),
 CONSTRAINT bridge_wallet_entry_customer FOREIGN KEY(customer_id) REFERENCES bridge_customers(id),
 CHECK(kind IN ('topup','purchase')),
 CHECK(amount <> 0),
 CHECK(balance_after >= 0)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_cs;
