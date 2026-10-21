use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DeviceInfo {
    pub id: String,
    pub user_id: String,
    pub device_id: String,
    pub device_os: String,
    pub phone_make: String,
    pub phone_model: String,
    pub device_fingerprint: String,
    pub fcm_token: Option<String>,
    pub transaction_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct GopayToken {
    pub id: String,
    pub user_id: String,
    pub gopay_email: String,
    pub gopay_phone: String,
    pub gopay_account_id: String,
    pub merchant_id: Option<String>,  // ← ADD MERCHANT_ID!
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub cookies: Option<String>,  // ← ADD COOKIES!
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

