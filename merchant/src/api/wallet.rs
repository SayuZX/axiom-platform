use axum::{extract::State, Extension, Json};
use serde_json::Value;
use crate::{api::{AppState, require_admin, merchant_id}, error::Result};

pub async fn get_balance(State(state): State<AppState>, Extension(user_id): Extension<String>) -> Result<Json<Value>> {
    let (mut client, config) = require_admin(&state, &user_id).await?;
    let raw = client.get_balance(merchant_id(&config)?).await?;
    if raw.get("success") == Some(&Value::Bool(false)) {
        return Err(crate::error::AppError::GopayApi("Provider balance unavailable".into()));
    }
    let data = raw.get("data").and_then(Value::as_object)
        .ok_or_else(|| crate::error::AppError::GopayApi("Unknown provider balance response".into()))?;
    let mut amounts = serde_json::Map::new();
    for name in ["balance", "available_balance", "pending_balance", "current_balance", "total_balance", "withdrawable_balance"] {
        if let Some(value) = data.get(name).filter(|v| v.is_number()) { amounts.insert(name.into(), value.clone()); }
    }
    if amounts.is_empty() { return Err(crate::error::AppError::GopayApi("No recognized provider balance fields".into())); }
    if let Some(currency) = data.get("currency").and_then(Value::as_str) {
        if currency != "IDR" { return Err(crate::error::AppError::GopayApi("Unexpected balance currency".into())); }
    }
    // Monetary fields are genuine provider values; their unit is not documented by source.
    Ok(Json(serde_json::json!({"amount":null,"currency":"IDR","available":true,"unit":"unverified","provider_balance":amounts,"message":"Unit saldo belum terverifikasi"})))
}
pub async fn get_summary(State(state): State<AppState>, Extension(user_id): Extension<String>) -> Result<Json<Value>> {
    let (mut client, _) = require_admin(&state, &user_id).await?;
    Ok(Json(client.get_wallet_summary_v2(None, None).await?))
}
