use axum::{extract::{State, Path, Query}, Extension, Json};
use serde::Deserialize;
use serde_json::{Value, json};
use crate::{api::{AppState, require_admin, merchant_id, valid_id}, client::GopayClient, error::{AppError, Result}};
#[derive(Deserialize)]
pub struct UserListQuery { page: Option<i32> }
fn scoped(mut body: Value, merchant: &str) -> Result<Value> {
    let object = body.as_object_mut().ok_or_else(|| AppError::Validation("JSON object required".into()))?;
    object.insert("merchant_id".into(), json!(merchant));
    object.insert("merchant_access".into(), json!({"merchant_id":[merchant]}));
    Ok(body)
}
async fn target(client: &mut GopayClient, id: &str, merchant: &str) -> Result<Value> {
    if !valid_id(id) { return Err(AppError::Validation("Invalid user ID".into())); }
    let value = client.get_user_details(id).await?;
    let data = value.get("data").unwrap_or(&value);
    let belongs = data["merchant_id"].as_str() == Some(merchant)
        || data["merchant_access"]["merchant_id"].as_array().is_some_and(|ids| ids.iter().any(|v| v.as_str() == Some(merchant)));
    if !belongs { return Err(AppError::Authorization("Provider user merchant scope unverified".into())); }
    Ok(value)
}
pub async fn list_users(State(state): State<AppState>, Extension(user): Extension<String>, Query(query): Query<UserListQuery>) -> Result<Json<Value>> {
    let (mut client, config) = require_admin(&state, &user).await?;
    Ok(Json(client.get_user_list(query.page.unwrap_or(1).clamp(1,1000),Some(merchant_id(&config)?)).await?))
}
pub async fn search_users(State(state): State<AppState>, Extension(user): Extension<String>, Json(body): Json<Value>) -> Result<Json<Value>> {
    // No arbitrary provider query DSL: list endpoint enforces merchant scope.
    let (mut client, config) = require_admin(&state, &user).await?;
    let page = body["page"].as_i64().unwrap_or(1).clamp(1,1000) as i32;
    Ok(Json(client.get_user_list(page,Some(merchant_id(&config)?)).await?))
}
pub async fn get_user(State(state): State<AppState>, Extension(user): Extension<String>, Path(id): Path<String>) -> Result<Json<Value>> {
    let (mut client, config) = require_admin(&state, &user).await?;
    Ok(Json(target(&mut client,&id,merchant_id(&config)?).await?))
}
pub async fn add_user(State(state): State<AppState>, Extension(user): Extension<String>, Json(body): Json<Value>) -> Result<Json<Value>> {
    let (mut client, config) = require_admin(&state, &user).await?;
    let mut body = scoped(body,merchant_id(&config)?)?;
    body["origin"] = json!("gobiz");
    Ok(Json(client.add_user(body).await?))
}
pub async fn update_user(State(state): State<AppState>, Extension(user): Extension<String>, Path(id): Path<String>, Json(body): Json<Value>) -> Result<Json<Value>> {
    let (mut client, config) = require_admin(&state, &user).await?;
    let merchant = merchant_id(&config)?;
    target(&mut client,&id,merchant).await?;
    Ok(Json(client.update_user(&id,scoped(body,merchant)?).await?))
}
pub async fn delete_user(State(state): State<AppState>, Extension(user): Extension<String>, Path(id): Path<String>) -> Result<Json<Value>> {
    let (mut client, config) = require_admin(&state, &user).await?;
    target(&mut client,&id,merchant_id(&config)?).await?;
    Ok(Json(client.delete_user(&id).await?))
}
pub async fn update_permissions(State(state): State<AppState>, Extension(user): Extension<String>, Path(id): Path<String>, Json(body): Json<Value>) -> Result<Json<Value>> {
    let (mut client, config) = require_admin(&state, &user).await?;
    let merchant = merchant_id(&config)?;
    target(&mut client,&id,merchant).await?;
    Ok(Json(client.update_user_permissions(&id,scoped(body,merchant)?).await?))
}
