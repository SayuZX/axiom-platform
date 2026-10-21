use sqlx::MySqlPool;
use redis::aio::ConnectionManager;
use std::{sync::Arc, collections::HashMap};
use tokio::sync::{RwLock, Mutex};
use crate::{config::Config, http::client::HttpClient, client::GopayClient, error::{AppError, Result}};
pub mod auth;
pub mod wallet;
pub mod merchant;
pub mod payment;
pub mod webhook;
pub mod users;

#[derive(Clone)]
pub struct AppState {
    pub db: MySqlPool,
    pub redis: ConnectionManager,
    pub config: Config,
    pub user_clients: Arc<RwLock<HashMap<String, Arc<HttpClient>>>>,
    pub user_locks: Arc<RwLock<HashMap<String, Arc<Mutex<()>>>>>,
}
impl AppState {
    pub async fn user_lock(&self, user_id: &str) -> Arc<Mutex<()>> {
        self.user_locks.write().await.entry(user_id.to_owned()).or_default().clone()
    }
}
pub async fn connected_client(state: &AppState, user_id: &str) -> Result<GopayClient> {
    let email: String = sqlx::query_scalar("SELECT email FROM users WHERE id=?").bind(user_id).fetch_one(&state.db).await?;
    let http = auth::get_or_create_user_client(state, user_id).await;
    let mut client = GopayClient::new(http, state.db.clone(), state.redis.clone(), user_id.to_owned(), email, String::new());
    client.init_device().await?;
    if !client.load_tokens().await? { return Err(AppError::Authentication("merchant_configuration_needed".into())); }
    Ok(client)
}
pub fn can_balance(config: &serde_json::Value) -> bool {
    // The supplied adapter uses a nonempty permission scope string, not a caller role.
    config["user"]["permissions"]["Wallet:Balance"].as_str()
        .is_some_and(|scope| !scope.trim().is_empty() && !matches!(scope.trim().to_ascii_lowercase().as_str(), "false"|"none"|"deny"|"denied"))
}
pub async fn require_admin(state: &AppState, user_id: &str) -> Result<(GopayClient, serde_json::Value)> {
    let mut client = connected_client(state, user_id).await?;
    let config = client.get_user_config().await?;
    if !can_balance(&config) { return Err(AppError::Authorization("Provider administrator permission required".into())); }
    merchant_id(&config)?;
    Ok((client, config))
}
pub fn merchant_id(config: &serde_json::Value) -> Result<&str> {
    config["merchant"]["id"].as_str().filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Authentication("merchant_configuration_needed".into()))
}
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn balance_requires_explicit_provider_scope() {
        for value in [json!({}), json!({"role":"admin"}), json!({"user":{"permissions":{"Wallet:Balance":false}}}), json!({"user":{"permissions":{"Wallet:Balance":"deny"}}})] { assert!(!can_balance(&value)); }
        assert!(can_balance(&json!({"user":{"permissions":{"Wallet:Balance":"merchant"}}})));
        for permission in [json!(true),json!([]),json!(["merchant"]),json!({"scope":"merchant"}),json!(" false "),json!("")] {
            assert!(!can_balance(&json!({"user":{"permissions":{"Wallet:Balance":permission}}})));
        }
    }
}
