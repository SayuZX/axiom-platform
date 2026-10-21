-- MariaDB reports ascii_bin VARCHAR as binary protocol metadata; SQLx String rejects it.
-- Keep case-sensitive, accent-sensitive, no-padding equality without the BINARY flag.
ALTER TABLE payment_orders MODIFY order_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_cs NOT NULL;
ALTER TABLE webhooks MODIFY url VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_cs NOT NULL;
ALTER TABLE webhook_outbox MODIFY event_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_cs NOT NULL;
ALTER TABLE api_keys MODIFY key_digest CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_nopad_as_cs NOT NULL;
