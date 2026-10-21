use axum::{extract::State, Extension, Json};
use serde_json::Value;
use crate::{api::{AppState, connected_client, require_admin, merchant_id}, error::Result};

pub async fn get_user_config(State(state): State<AppState>, Extension(user_id): Extension<String>) -> Result<Json<Value>> {
    let (_, config) = require_admin(&state, &user_id).await?;
    Ok(Json(config))
}
pub async fn get_qris_pops(State(state): State<AppState>, Extension(user_id): Extension<String>) -> Result<Json<Value>> {
    let mut client = connected_client(&state, &user_id).await?;
    let config = client.get_user_config().await?;
    Ok(Json(client.get_qris_pops(merchant_id(&config)?).await?))
}
pub async fn get_profile(State(state): State<AppState>, Extension(user_id): Extension<String>) -> Result<Json<Value>> {
    let mut client = connected_client(&state, &user_id).await?;
    Ok(Json(client.get_profile().await?))
}
pub async fn get_balance_home(State(state): State<AppState>, Extension(user_id): Extension<String>) -> Result<Json<Value>> {
    let (mut client, _) = require_admin(&state, &user_id).await?;
    Ok(Json(client.get_balance_home().await?))
}
pub async fn get_balance_multi_wallet(State(state): State<AppState>, Extension(user_id): Extension<String>) -> Result<Json<Value>> {
    let (mut client, _) = require_admin(&state, &user_id).await?;
    Ok(Json(client.get_balance_multi_wallet().await?))
}
pub async fn get_wallets_balance_v2(State(state): State<AppState>, Extension(user_id): Extension<String>) -> Result<Json<Value>> {
    let (mut client, _) = require_admin(&state, &user_id).await?;
    Ok(Json(client.get_wallets_balance_v2().await?))
}
