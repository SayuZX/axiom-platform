use axum::{extract::{Request, State}, middleware::Next, response::Response};
use sqlx::Row;
use sha2::{Digest, Sha256};
use crate::{api::AppState, error::{AppError, Result}};

pub async fn validate_api_key(State(state): State<AppState>, mut req: Request, next: Next) -> Result<Response> {
    // Backend is server-to-server only. Browser cookies belong exclusively to the BFF.
    let key = req.headers().get("X-API-Key").and_then(|v| v.to_str().ok())
        .filter(|s| s.starts_with("gpm_live_") && s.len() == 41)
        .ok_or(AppError::InvalidToken)?;
    let row = sqlx::query("SELECT user_id,api_key_hash,rate_limit_per_minute FROM api_keys WHERE key_digest=? AND is_active=1 AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP())")
        .bind(hex::encode(Sha256::digest(key.as_bytes()))).fetch_optional(&state.db).await?.ok_or(AppError::InvalidToken)?;
    let hash: String = row.try_get("api_key_hash")?;
    if !bcrypt::verify(key, &hash)? { return Err(AppError::InvalidToken); }
    let user_id: String = row.try_get("user_id")?;
    let limit: i32 = row.try_get("rate_limit_per_minute")?;
    let mut redis = state.redis.clone();
    if !crate::redis::check_rate_limit(&mut redis, &format!("merchant:rate:{}:{}",user_id,chrono::Utc::now().timestamp()/60), limit as u32, 60).await? {
        return Err(AppError::RateLimitExceeded);
    }
    let path = req.uri().path();
    if !path.starts_with("/api/auth/") {
        let token = crate::db::queries::get_gopay_token(&state.db, &user_id).await?;
        if token.is_none() { return Err(AppError::Authentication("merchant_configuration_needed".into())); }
    }
    // Serializes a user's login cookies and token refresh against requests/polling.
    let lock = state.user_lock(&user_id).await;
    let _guard = lock.lock().await;
    req.extensions_mut().insert(user_id);
    Ok(next.run(req).await)
}
