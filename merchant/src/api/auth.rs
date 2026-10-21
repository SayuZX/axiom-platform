// Auth API handlers
use axum::{extract::State, http::HeaderMap, Json, Extension};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use crate::api::AppState;
use crate::client::GopayClient;
use crate::error::Result;

/// Get or create a per-user HttpClient (cookie continuity across login steps)
pub async fn get_or_create_user_client(state: &AppState, user_id: &str) -> Arc<crate::http::client::HttpClient> {
    let mut clients = state.user_clients.write().await;
    if let Some(client) = clients.get(user_id) {
        return client.clone();
    }
    let client = Arc::new(crate::http::client::HttpClient::new());
    clients.insert(user_id.to_string(), client.clone());
    client
}

async fn bound_email(state: &AppState, user_id: &str, email: Option<&str>) -> Result<()> {
    let stored: String = sqlx::query_scalar("SELECT email FROM users WHERE id = ?")
        .bind(user_id).fetch_one(&state.db).await?;
    if !email.is_some_and(|e| e.trim().eq_ignore_ascii_case(&stored)) {
        return Err(crate::error::AppError::Authorization("Email must match the site owner account".into()));
    }
    Ok(())
}

// Step 1: Login methods
#[derive(Debug, Deserialize)]
pub struct LoginMethodsRequest {
    pub email: Option<String>,
    pub phone: Option<String>,
    pub country_code: Option<String>,
}

pub async fn login_methods(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(req): Json<LoginMethodsRequest>,
) -> Result<Json<serde_json::Value>> {
    bound_email(&state, &user_id, req.email.as_deref()).await?;
    
    let http_client = get_or_create_user_client(&state, &user_id).await;
    
    let mut client = GopayClient::new(
        http_client, state.db.clone(), state.redis.clone(), user_id,
        req.email.clone().unwrap_or_default(), req.phone.clone().unwrap_or_default()
    );
    client.init_device().await?;
    
    let result = client.login_methods(req.email.as_deref(), req.phone.as_deref(), req.country_code.as_deref()).await?;
    Ok(Json(serde_json::json!(result)))
}

// Step 2: OTP initiate
#[derive(Debug, Deserialize)]
pub struct OtpInitiateRequest {
    pub email: Option<String>,
    pub phone: Option<String>,
    pub verification_id: String,
    pub method: String,
    pub challenge_token: Option<String>,
    pub user_token: Option<String>,
}

pub async fn otp_initiate(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(req): Json<OtpInitiateRequest>,
) -> Result<Json<serde_json::Value>> {
    bound_email(&state, &user_id, req.email.as_deref()).await?;
    
    let http_client = get_or_create_user_client(&state, &user_id).await;
    
    let mut client = GopayClient::new(
        http_client, state.db.clone(), state.redis.clone(), user_id,
        req.email.clone().unwrap_or_default(), req.phone.clone().unwrap_or_default()
    );
    client.init_device().await?;
    
    let result = client.otp_initiate(&req.verification_id, req.email.as_deref(), req.phone.as_deref(), &req.method).await?;
    Ok(Json(serde_json::json!(result)))
}

// Step 3: OTP verify
#[derive(Debug, Deserialize)]
pub struct OtpVerifyRequest {
    pub email: Option<String>,
    pub phone: Option<String>,
    pub otp_token: String,
    pub otp_code: String,
    pub verification_id: String,
    pub challenge_token: Option<String>,
    pub method: String,
}

pub async fn otp_verify(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(req): Json<OtpVerifyRequest>,
) -> Result<Json<serde_json::Value>> {
    bound_email(&state, &user_id, req.email.as_deref()).await?;
    
    let http_client = get_or_create_user_client(&state, &user_id).await;
    
    let mut client = GopayClient::new(
        http_client, state.db.clone(), state.redis.clone(), user_id,
        req.email.clone().unwrap_or_default(), req.phone.clone().unwrap_or_default()
    );
    client.init_device().await?;
    
    let result = client.otp_verify(&req.verification_id, &req.otp_code, &req.otp_token, req.email.as_deref(), &req.method).await?;
    Ok(Json(serde_json::json!(result)))
}

// Step 4: Get account list
#[derive(Debug, Deserialize)]
pub struct AccountListRequest {
    pub email: Option<String>,
    pub phone: Option<String>,
    pub verification_token: String,
}

pub async fn get_account_list(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(req): Json<AccountListRequest>,
) -> Result<Json<serde_json::Value>> {
    bound_email(&state, &user_id, req.email.as_deref()).await?;
    
    let http_client = get_or_create_user_client(&state, &user_id).await;
    
    let mut client = GopayClient::new(
        http_client, state.db.clone(), state.redis.clone(), user_id,
        req.email.clone().unwrap_or_default(), req.phone.clone().unwrap_or_default()
    );
    client.init_device().await?;
    
    let result = client.get_account_list(&req.verification_token).await?;
    Ok(Json(serde_json::json!(result)))
}

// Step 5: Exchange 1FA to 2FA
#[derive(Debug, Deserialize)]
pub struct Exchange1faRequest {
    pub email: Option<String>,
    pub phone: Option<String>,
    pub token_1fa: String,
    pub account_id: String,
}

pub async fn exchange_1fa_to_2fa(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(req): Json<Exchange1faRequest>,
) -> Result<Json<serde_json::Value>> {
    bound_email(&state, &user_id, req.email.as_deref()).await?;
    
    let http_client = get_or_create_user_client(&state, &user_id).await;
    
    let mut client = GopayClient::new(
        http_client, state.db.clone(), state.redis.clone(), user_id,
        req.email.clone().unwrap_or_default(), req.phone.clone().unwrap_or_default()
    );
    client.init_device().await?;
    
    let result = client.exchange_1fa_to_2fa(&req.account_id, &req.token_1fa).await?;
    
    if result.success {
        if let Some(data) = &result.data {
            if let (Some(access_token), Some(refresh_token)) = (&data.access_token, &data.refresh_token) {
                client.save_tokens(access_token, refresh_token, &req.account_id).await?;
            }
        }
    }
    
    Ok(Json(serde_json::json!(result)))
}

// Step 6: Initiate 2FA OTP
#[derive(Debug, Deserialize)]
pub struct Initiate2faRequest {
    pub email: String,
    pub verification_id: String,
    #[serde(default = "default_method")]
    pub method: String,
}

fn default_method() -> String { "otp_sms".to_string() }

pub async fn initiate_2fa_otp(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(req): Json<Initiate2faRequest>,
) -> Result<Json<serde_json::Value>> {
    bound_email(&state, &user_id, Some(&req.email)).await?;
    
    let http_client = get_or_create_user_client(&state, &user_id).await;
    
    let mut client = GopayClient::new(http_client, state.db.clone(), state.redis.clone(), user_id.clone(), req.email.clone(), "".to_string());
    client.init_device().await?;
    
    let result = client.initiate_2fa_otp(&req.email, &req.verification_id, &req.method).await;
    
    Ok(Json(serde_json::json!(result?)))
}

// Step 7: Verify 2FA OTP
#[derive(Debug, Deserialize)]
pub struct Verify2faRequest {
    pub email: String,
    pub otp_code: String,
    pub otp_token: String,
    pub verification_id: String,
    #[serde(default = "default_method")]
    pub method: String,
}

pub async fn verify_2fa_otp(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(req): Json<Verify2faRequest>,
) -> Result<Json<serde_json::Value>> {
    bound_email(&state, &user_id, Some(&req.email)).await?;
    let http_client = get_or_create_user_client(&state, &user_id).await;
    
    let mut client = GopayClient::new(http_client, state.db.clone(), state.redis.clone(), user_id, req.email.clone(), "".to_string());
    client.init_device().await?;
    
    let result = client.verify_2fa_otp(&req.otp_code, &req.otp_token, &req.verification_id, &req.method).await?;
    Ok(Json(serde_json::json!(result)))
}

// Step 8: Exchange 2FA to full access
#[derive(Debug, Deserialize)]
pub struct Exchange2faRequest {
    pub email: String,
    pub account_id: String,
    pub token_2fa: String,
    pub verification_token: String,
}

pub async fn exchange_2fa_to_full_access(
    State(state): State<AppState>,
    Extension(user_id): Extension<String>,
    Json(req): Json<Exchange2faRequest>,
) -> Result<Json<serde_json::Value>> {
    bound_email(&state, &user_id, Some(&req.email)).await?;
    let http_client = get_or_create_user_client(&state, &user_id).await;
    let mut client = GopayClient::new(http_client, state.db.clone(), state.redis.clone(), user_id, req.email, String::new());
    client.init_device().await?;
    let result = client.exchange_2fa_to_full_access(&req.account_id, &req.token_2fa, &req.verification_token).await?;
    Ok(Json(serde_json::json!(result)))
}

// Internal provisioning only; provider login remains a separate owner-only flow.
const SITE_OWNER_ID: &str = "00000000-0000-4000-8000-000000000001";

#[derive(Deserialize)]
pub struct OwnerRequest {
    pub email: String,
}

pub async fn owner(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<OwnerRequest>,
) -> Result<Json<serde_json::Value>> {
    use crate::error::AppError;
    let mut supplied_key = [0u8; 32];
    let header = headers.get("x-owner-setup-key").and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::Authentication("Invalid owner setup key".into()))?;
    hex::decode_to_slice(header, &mut supplied_key)
        .map_err(|_| AppError::Authentication("Invalid owner setup key".into()))?;
    let mut expected = Hmac::<Sha256>::new_from_slice(&state.config.owner_setup_key)
        .expect("HMAC accepts a 32-byte key");
    expected.update(b"axiom-site-owner-setup");
    let mut supplied = Hmac::<Sha256>::new_from_slice(&supplied_key)
        .expect("HMAC accepts a 32-byte key");
    supplied.update(b"axiom-site-owner-setup");
    supplied.verify_slice(&expected.finalize().into_bytes())
        .map_err(|_| AppError::Authentication("Invalid owner setup key".into()))?;

    let email = req.email.trim().to_ascii_lowercase();
    let valid_email = email.len() <= 254 && email.split_once('@').is_some_and(|(local, domain)| {
        !local.is_empty() && local.len() <= 64 && !local.starts_with('.') && !local.ends_with('.')
            && !local.contains("..")
            && local.bytes().all(|b| b.is_ascii_alphanumeric() || b".!#$%&'*+-/=?^_`{|}~".contains(&b))
            && domain.contains('.') && domain.split('.').all(|label| {
                !label.is_empty() && label.len() <= 63 && !label.starts_with('-') && !label.ends_with('-')
                    && label.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
            })
    });
    if !valid_email { return Err(AppError::Validation("Invalid owner email".into())); }

    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT IGNORE INTO users (id,email) VALUES (?,?)")
        .bind(SITE_OWNER_ID).bind(&email).execute(&mut *tx).await?;
    let stored_email: String = sqlx::query_scalar("SELECT email FROM users WHERE id=? FOR UPDATE")
        .bind(SITE_OWNER_ID).fetch_optional(&mut *tx).await?
        .ok_or_else(|| AppError::Validation("Email already belongs to an existing merchant user".into()))?;
    if stored_email != email {
        return Err(AppError::Validation("Email must match the existing site owner account".into()));
    }
    let api_key = format!("gpm_live_{}", uuid::Uuid::new_v4().simple());
    let hash = bcrypt::hash(&api_key, bcrypt::DEFAULT_COST)?;
    let encrypted = crate::db::encryption::encrypt(&api_key).map_err(AppError::Internal)?;
    let digest = hex::encode(Sha256::digest(api_key.as_bytes()));
    sqlx::query("INSERT INTO api_keys (user_id,api_key_hash,key_digest,encrypted_api_key,name,rate_limit_per_minute) VALUES (?,?,?,?, 'Default',60)")
        .bind(SITE_OWNER_ID).bind(hash).bind(digest).bind(encrypted).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(serde_json::json!({"success":true,"data":{"api_key":api_key,"user_id":SITE_OWNER_ID,"rate_limit":60}})))
}

pub async fn me(State(state): State<AppState>, Extension(user_id): Extension<String>) -> Result<Json<serde_json::Value>> {
    let token = crate::db::queries::get_gopay_token(&state.db, &user_id).await?;
    if token.is_none() {
        return Ok(Json(serde_json::json!({"authenticated":false,"role":"pending","user_id":user_id,"merchant_id":null,"can_balance":false})));
    }
    let mut client = super::connected_client(&state, &user_id).await?;
    let config = client.get_user_config().await?;
    let merchant_id = config["merchant"]["id"].as_str();
    let can_balance = merchant_id.is_some() && super::can_balance(&config);
    Ok(Json(serde_json::json!({"authenticated":merchant_id.is_some(),"role":if merchant_id.is_none(){"pending"}else if can_balance{"admin"}else{"cashier"},"user_id":user_id,"merchant_id":merchant_id,"can_balance":can_balance})))
}