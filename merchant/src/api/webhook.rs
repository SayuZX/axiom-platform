use axum::{extract::{State, Path}, Extension, Json};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use crate::{api::AppState, error::{AppError, Result}};
#[derive(Deserialize)]
pub struct RegisterWebhookRequest { url: String, events: Vec<String>, api_key: Option<String>, signing_key: Option<String> }
pub fn allowed_url(url: &str, origin: &str) -> bool {
    reqwest::Url::parse(url).is_ok_and(|u| u.origin().ascii_serialization() == origin && u.scheme()=="https" && u.username().is_empty() && u.password().is_none() && u.fragment().is_none())
}
pub async fn register(State(state): State<AppState>, Extension(user): Extension<String>, Json(req): Json<RegisterWebhookRequest>) -> Result<Json<Value>> {
    if !allowed_url(&req.url,&state.config.webhook_allowed_origin) { return Err(AppError::Validation("Webhook must use configured HTTPS origin, no credentials or fragment".into())); }
    if req.events != ["transaction.received"] { return Err(AppError::Validation("Only transaction.received is supported".into())); }
    let secret = req.signing_key.or(req.api_key).filter(|s| (32..=256).contains(&s.len()))
        .ok_or_else(|| AppError::Validation("A 32..256 byte signing_key (or api_key) is required".into()))?;
    let encrypted = crate::db::encryption::encrypt(&secret).map_err(AppError::Internal)?;
    let id = uuid::Uuid::new_v4().to_string();
    // Identical registrations preserve the endpoint ID and existing idempotency keys.
    sqlx::query("INSERT INTO webhooks (id,user_id,url,events,encrypted_api_key,is_active) VALUES (?,?,?,?,?,1) ON DUPLICATE KEY UPDATE encrypted_api_key=VALUES(encrypted_api_key),is_active=1")
        .bind(id).bind(&user).bind(&req.url).bind(serde_json::to_string(&req.events)?).bind(encrypted).execute(&state.db).await?;
    let id: String = sqlx::query_scalar("SELECT id FROM webhooks WHERE user_id=? AND url=?").bind(&user).bind(&req.url).fetch_one(&state.db).await?;
    Ok(Json(json!({"success":true,"webhook":{"id":id,"url":req.url,"events":req.events,"is_active":true}})))
}
pub async fn list(State(state): State<AppState>, Extension(user): Extension<String>) -> Result<Json<Value>> {
    let rows = sqlx::query("SELECT id,url,is_active FROM webhooks WHERE user_id=?").bind(user).fetch_all(&state.db).await?;
    let mut data = Vec::with_capacity(rows.len());
    for row in rows { data.push(json!({"id":row.try_get::<String,_>("id")?,"url":row.try_get::<String,_>("url")?,"is_active":row.try_get::<bool,_>("is_active")?,"events":["transaction.received"]})); }
    Ok(Json(json!({"success":true,"webhooks":data})))
}
pub async fn delete(State(state): State<AppState>, Extension(user): Extension<String>, Path(id): Path<String>) -> Result<Json<Value>> {
    let result = sqlx::query("UPDATE webhooks SET is_active=0 WHERE id=? AND user_id=?").bind(id).bind(user).execute(&state.db).await?;
    if result.rows_affected()==0 { return Err(AppError::NotFound("Webhook not found".into())); }
    Ok(Json(json!({"success":true})))
}
pub fn signature(key: &[u8], payload: &[u8]) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts any key size");
    mac.update(payload); hex::encode(mac.finalize().into_bytes())
}
pub async fn deliver(state: &AppState, client: &reqwest::Client) -> Result<()> {
    let rows = sqlx::query("SELECT o.id,o.payload,o.attempts,w.url,w.encrypted_api_key FROM webhook_outbox o JOIN webhooks w ON w.id=o.webhook_id WHERE o.delivered_at IS NULL AND o.attempts<8 AND o.next_attempt_at<=UTC_TIMESTAMP() AND w.is_active=1 ORDER BY o.id LIMIT 25")
        .fetch_all(&state.db).await?;
    for row in rows {
        let id: i64 = row.try_get("id")?;
        let attempts: i32 = row.try_get("attempts")?;
        let url: String = row.try_get("url")?;
        let payload: String = row.try_get("payload")?;
        let encrypted: String = row.try_get("encrypted_api_key")?;
        // Reserve before I/O; a crash retries the identical durable payload after the lease.
        let claimed = sqlx::query("UPDATE webhook_outbox SET attempts=attempts+1,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 60 SECOND) WHERE id=? AND attempts=? AND delivered_at IS NULL")
            .bind(id).bind(attempts).execute(&state.db).await?;
        if claimed.rows_affected()!=1 { continue; }
        let key = crate::db::encryption::decrypt(&encrypted).map_err(AppError::Internal)?;
        let success = if allowed_url(&url,&state.config.webhook_allowed_origin) {
            client.post(&url).header("Content-Type","application/json").header("X-Signature",signature(key.as_bytes(),payload.as_bytes()))
                .body(payload).send().await.is_ok_and(|r| r.status().is_success())
        } else { false };
        if success {
            sqlx::query("UPDATE webhook_outbox SET delivered_at=UTC_TIMESTAMP() WHERE id=?").bind(id).execute(&state.db).await?;
        } else {
            let delay = (5_i32 * 2_i32.pow((attempts+1) as u32)).min(3600);
            sqlx::query("UPDATE webhook_outbox SET next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND) WHERE id=?").bind(delay).bind(id).execute(&state.db).await?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn callback_origin_is_exact() {
        let origin="https://ai.axiomcreative.xyz";
        assert!(allowed_url("https://ai.axiomcreative.xyz/api/merchant/webhook",origin));
        for url in ["http://ai.axiomcreative.xyz/hook","https://ai.axiomcreative.xyz.evil.test/hook","https://user@ai.axiomcreative.xyz/hook","https://127.0.0.1/hook","https://ai.axiomcreative.xyz:8443/hook"] { assert!(!allowed_url(url,origin)); }
    }
    #[test]
    fn signature_authenticates_exact_bytes() {
        assert_eq!(signature(b"key",b"The quick brown fox jumps over the lazy dog"),"f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
        assert_ne!(signature(b"key",b"{}"),signature(b"key",b"{ }"));
    }
}
