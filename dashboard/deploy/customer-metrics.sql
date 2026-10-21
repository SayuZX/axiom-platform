CREATE TABLE IF NOT EXISTS bridge_playground_metrics (
  id CHAR(36) NOT NULL PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  api_key_id VARCHAR(128) NOT NULL,
  model VARCHAR(300) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  http_status SMALLINT UNSIGNED NOT NULL,
  prompt_tokens BIGINT UNSIGNED NULL,
  completion_tokens BIGINT UNSIGNED NULL,
  total_ms DOUBLE NOT NULL,
  ttft_ms DOUBLE NULL,
  generation_ms DOUBLE NULL,
  tps_reason VARCHAR(240) NULL,
  INDEX customer_time (customer_id, created_at),
  INDEX customer_model (customer_id, model)
) ENGINE=InnoDB;
