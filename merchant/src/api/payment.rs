use axum::{extract::{State, Path, Query}, Extension, Json};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use crate::{api::{AppState, connected_client, merchant_id, valid_id}, error::{AppError, Result}};

#[derive(Deserialize)]
pub struct GenerateQrisRequest { pub amount: i64, pub order_id: Option<String> }
#[derive(Clone, Serialize, sqlx::FromRow)]
pub struct Order {
    pub order_id: String, pub user_id: String, pub merchant_id: String, pub pop_id: String,
    pub transaction_id: Option<String>, pub amount: i64, pub status: String,
    pub qr_string: Option<String>, pub qr_image_url: Option<String>, pub expires_at: Option<String>,
    pub created_at: DateTime<Utc>,
}
impl Order {
    pub fn response(&self) -> Value { json!({"order_id":self.order_id,"transaction_id":self.transaction_id,"amount":self.amount,"currency":"IDR","status":self.status,"qr_string":self.qr_string,"qr_image_url":self.qr_image_url,"expires_at":self.expires_at,"created_at":self.created_at}) }
}
pub fn valid_amount(amount: i64) -> bool { (1..=10_000_000).contains(&amount) }
fn bad_provider() -> AppError { AppError::GopayApi("Provider payment identity, amount, currency or state could not be verified".into()) }
fn rupiah(value: &Value) -> Option<i64> {
    if let Some(n) = value.as_i64() { return Some(n); }
    let text = value.as_str()?;
    let (whole, fraction) = text.split_once('.').unwrap_or((text,""));
    if whole.is_empty() || !whole.bytes().all(|c| c.is_ascii_digit()) || !fraction.bytes().all(|c| c == b'0') { return None; }
    whole.parse().ok()
}
fn provider_status(value: &Value, order: &Order) -> Result<String> {
    if value["order_id"].as_str() != Some(&order.order_id) || rupiah(&value["gross_amount"]) != Some(order.amount)
        || value["currency"].as_str() != Some("IDR") || value["payment_type"].as_str() != Some("qris") { return Err(bad_provider()); }
    let id = value["transaction_id"].as_str().filter(|s| !s.is_empty()).ok_or_else(bad_provider)?;
    if order.transaction_id.as_deref().is_some_and(|stored| stored != id) { return Err(bad_provider()); }
    // Midtrans's merchant_id may differ from GoBiz merchant ID. The persisted POP scopes
    // every request; compare only a POP identity if the provider explicitly returns one.
    if value.get("pop_id").is_some_and(|v| v.as_str() != Some(order.pop_id.as_str())) { return Err(bad_provider()); }
    match value["transaction_status"].as_str() {
        Some(status @ ("pending"|"settlement"|"cancel"|"expire"|"deny"|"failure")) => Ok(status.into()),
        _ => Err(bad_provider()),
    }
}
pub fn transition<'a>(current: &'a str, observed: &'a str) -> &'a str {
    if current == "settlement" || (current != "pending" && observed != "settlement") { current } else { observed }
}
pub async fn owned(state: &AppState, user: &str, id: &str) -> Result<Order> {
    if !valid_id(id) { return Err(AppError::Validation("Invalid order_id".into())); }
    sqlx::query_as("SELECT * FROM payment_orders WHERE order_id=? AND user_id=?")
        .bind(id).bind(user).fetch_optional(&state.db).await?.ok_or_else(|| AppError::NotFound("Order not found".into()))
}
pub async fn reconcile(state: &AppState, user: &str, id: &str) -> Result<Order> {
    let order = owned(state,user,id).await?;
    let mut client = connected_client(state,user).await?;
    let config = client.get_user_config().await?;
    if merchant_id(&config)? != order.merchant_id { return Err(AppError::Authorization("Merchant changed; original account required".into())); }
    let value = client.get_payment_status(id,&order.pop_id,None).await?;
    apply_observation(state, &order, &value).await
}
async fn apply_observation(state: &AppState, order: &Order, value: &Value) -> Result<Order> {
    let observed = provider_status(value,order)?;
    let mut tx = state.db.begin().await?;
    let latest: Order = sqlx::query_as("SELECT * FROM payment_orders WHERE order_id=? AND user_id=? FOR UPDATE")
        .bind(&order.order_id).bind(&order.user_id).fetch_one(&mut *tx).await?;
    provider_status(value,&latest)?;
    let status = transition(&latest.status,&observed);
    let qr = value["qr_string"].as_str();
    let image = value["actions"].as_array().and_then(|a| a.iter().find(|a| a["name"] == "generate-qr-code")).and_then(|a| a["url"].as_str());
    let expiry = value["expiry_time"].as_str();
    sqlx::query("UPDATE payment_orders SET transaction_id=?,status=?,qr_string=COALESCE(?,qr_string),qr_image_url=COALESCE(?,qr_image_url),expires_at=COALESCE(?,expires_at),last_checked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE order_id=?")
        .bind(value["transaction_id"].as_str()).bind(status).bind(qr).bind(image).bind(expiry).bind(&order.order_id).execute(&mut *tx).await?;
    if status == "settlement" {
        let event_id = format!("qris:{}:settlement",order.order_id);
        let payload = serde_json::to_string(&json!({"event":"transaction.received","event_id":event_id,"timestamp":Utc::now().to_rfc3339(),"transaction":{"id":value["transaction_id"],"order_id":order.order_id,"amount":order.amount,"currency":"IDR","status":"settlement","payment_type":"qris"}}))?;
        sqlx::query("INSERT INTO webhook_outbox (webhook_id,event_id,payload) SELECT id,?,? FROM webhooks WHERE user_id=? AND is_active=1 ON DUPLICATE KEY UPDATE event_id=VALUES(event_id)")
            .bind(event_id).bind(payload).bind(&order.user_id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    owned(state,&order.user_id,&order.order_id).await
}
pub async fn generate_qris(State(state): State<AppState>, Extension(user): Extension<String>, Json(req): Json<GenerateQrisRequest>) -> Result<Json<Value>> {
    if !valid_amount(req.amount) { return Err(AppError::Validation("amount must be integer IDR 1..10000000".into())); }
    let id = req.order_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    if !valid_id(&id) { return Err(AppError::Validation("order_id must be 1..64 ASCII letters, digits, hyphen or underscore".into())); }
    let existing: Option<Order> = sqlx::query_as("SELECT * FROM payment_orders WHERE order_id=?").bind(&id).fetch_optional(&state.db).await?;
    if let Some(order) = existing {
        if order.user_id != user { return Err(AppError::NotFound("Order not found".into())); }
        if order.amount != req.amount { return Err(AppError::Validation("order_id already bound to another amount".into())); }
        if order.transaction_id.is_none() { return Ok(Json(reconcile(&state,&user,&id).await?.response())); }
        return Ok(Json(order.response()));
    }
    let mut client = connected_client(&state,&user).await?;
    let config = client.get_user_config().await?;
    let merchant = merchant_id(&config)?;
    let pops = client.get_qris_pops(merchant).await?;
    let pop = pops["data"].as_array().and_then(|items| items.iter().find(|p| {
        p["status"] == "active" && (p["gopay"]["aspi_qr_string"].as_str().is_some_and(|s| !s.is_empty()) || p["gopay"]["product_identifier"] == "EDC")
    })).and_then(|p| p["pop_id"].as_str()).ok_or_else(|| AppError::Authentication("merchant_qris_configuration_needed".into()))?;
    if !valid_id(pop) { return Err(bad_provider()); }
    // Durable reservation precedes the external side effect. An ambiguous provider failure
    // is reconciled by status, never retried as another charge.
    sqlx::query("INSERT INTO payment_orders (order_id,user_id,merchant_id,pop_id,amount,status) VALUES (?,?,?,?,?,'pending')")
        .bind(&id).bind(&user).bind(merchant).bind(pop).bind(req.amount).execute(&state.db).await?;
    let order = owned(&state,&user,&id).await?;
    let value = client.generate_qris_midtrans(pop,req.amount,Some(id)).await?;
    let result = apply_observation(&state,&order,&value).await?;
    if result.qr_string.is_none() && result.qr_image_url.is_none() && result.status == "pending" {
        return Err(AppError::GopayApi("Provider returned no QR; check existing order status".into()));
    }
    Ok(Json(result.response()))
}
pub async fn get_status(State(state): State<AppState>, Extension(user): Extension<String>, Path(id): Path<String>) -> Result<Json<Value>> {
    Ok(Json(reconcile(&state,&user,&id).await?.response()))
}
pub async fn cancel(State(state): State<AppState>, Extension(user): Extension<String>, Path(id): Path<String>) -> Result<Json<Value>> {
    let order = reconcile(&state,&user,&id).await?;
    if order.status != "pending" { return Ok(Json(order.response())); }
    let mut client = connected_client(&state,&user).await?;
    let attempted = client.cancel_payment(&id,&order.pop_id).await;
    // Never accept a cancel response as proof: settlement may win the race.
    let verified = reconcile(&state,&user,&id).await;
    match verified { Ok(order) => Ok(Json(order.response())), Err(error) => { attempted?; Err(error) } }
}
#[derive(Deserialize)]
pub struct ListQuery { page: Option<u32>, limit: Option<u32>, status: Option<String> }
pub async fn list(State(state): State<AppState>, Extension(user): Extension<String>, Query(query): Query<ListQuery>) -> Result<Json<Value>> {
    let page = query.page.unwrap_or(1).clamp(1,1_000_000);
    let limit = query.limit.unwrap_or(20).clamp(1,100);
    let status = query.status;
    let orders: Vec<Order> = sqlx::query_as("SELECT * FROM payment_orders WHERE user_id=? AND (? IS NULL OR status=?) ORDER BY created_at DESC,order_id DESC LIMIT ? OFFSET ?")
        .bind(&user).bind(&status).bind(&status).bind(limit).bind((page-1)*limit).fetch_all(&state.db).await?;
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM payment_orders WHERE user_id=? AND (? IS NULL OR status=?)")
        .bind(user).bind(&status).bind(&status).fetch_one(&state.db).await?;
    Ok(Json(json!({"success":true,"data":orders.iter().map(Order::response).collect::<Vec<_>>(),"pagination":{"page":page,"limit":limit,"total":total,"total_pages":(total+limit as i64-1)/limit as i64}})))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn amount_and_path_boundaries() {
        assert!(!valid_amount(0)); assert!(!valid_amount(-1)); assert!(!valid_amount(10_000_001));
        assert!(valid_amount(1)); assert!(valid_amount(10_000_000));
        assert!(!valid_id("../other")); assert!(!valid_id(&"x".repeat(65)));
        assert_eq!(rupiah(&json!("100.00")),Some(100)); assert_eq!(rupiah(&json!("100.50")),None);
    }
    #[test]
    fn settlement_wins_cancel_race_without_regression() {
        assert_eq!(transition("pending","cancel"),"cancel");
        assert_eq!(transition("cancel","settlement"),"settlement");
        assert_eq!(transition("settlement","cancel"),"settlement");
        assert_eq!(transition("expire","pending"),"expire");
    }
    #[test]
    fn paid_requires_matching_identity_and_explicit_money() {
        let order = Order {order_id:"a".into(),user_id:"u".into(),merchant_id:"m".into(),pop_id:"p".into(),transaction_id:Some("t".into()),amount:100,status:"pending".into(),qr_string:None,qr_image_url:None,expires_at:None,created_at:Utc::now()};
        let correct = json!({"order_id":"a","transaction_id":"t","gross_amount":"100.00","currency":"IDR","payment_type":"qris","transaction_status":"settlement"});
        assert_eq!(provider_status(&correct,&order).unwrap(),"settlement");
        for (field,value) in [("order_id",json!("other")),("transaction_id",json!("other")),("gross_amount",Value::Null),("currency",json!("USD")),("transaction_status",Value::Null),("payment_type",json!("card"))] {
            let mut invalid = correct.clone(); invalid[field]=value; assert!(provider_status(&invalid,&order).is_err());
        }
    }
}
