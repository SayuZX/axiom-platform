// GoPay merchant endpoints
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::db::models::DeviceInfo;
use crate::error::{AppError, Result};
use crate::http::client::HttpClient;

/// Base URLs
const BASE_URL_MERCHANT: &str = "https://api.gobiz.co.id";
const BASE_URL_QRIS: &str = "https://api.midtrans.com";
const BASE_URL_GOPAYMERCHANT: &str = "https://gopaymerchant.midtrans.com";

/// Get account balance
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token from auth
/// * `account_id` - Merchant account ID (e.g. G746027573)
///
/// # Returns
/// Balance response
#[derive(Debug, Serialize, Deserialize)]
pub struct BalanceResponse {
    pub success: Option<bool>,
    pub data: Option<BalanceData>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BalanceData {
    pub balance: Option<i64>,
    pub currency: Option<String>,
}

pub async fn get_balance(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    account_id: &str,
) -> Result<Value> {
    let url = format!(
        "{}/plutus/api/v1/wallets/balance?currency=IDR&id={}",
        BASE_URL_MERCHANT, account_id
    );

    let params = HashMap::new();
    let response = http.get_json(&url, &params, device, Some(access_token)).await?;

    Ok(response)
}

/// Search transaction journals
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token
/// * `merchant_id` - Merchant ID (e.g. G544166476)
/// * `from_date` - Start date (ISO format: "2026-02-27T00:00:00+07:00")
/// * `to_date` - End date (ISO format: "2026-02-27T23:59:59+07:00")
/// * `size` - Number of results (default: 10)
/// * `from_offset` - Pagination offset (default: 0)
///
/// # Returns
/// Journals response
pub async fn search_journals(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    merchant_id: &str,
    from_date: &str,
    to_date: &str,
    size: i32,
    from_offset: i32,
) -> Result<Value> {
    let url = format!("{}/journals/search", BASE_URL_MERCHANT);

    let body = json!({
        "from": from_offset,
        "size": size,
        "sort": {"time": {"order": "desc"}},
        "time_range": {
            "gte": from_date,
            "lte": to_date
        },
        "query": [{
            "clauses": [
                {"field": "metadata.transaction.status", "op": "in", "value": ["settlement", "capture", "cancel", "failure", "deny", "authorize"]},
                {"field": "metadata.transaction.merchant_id", "op": "equal", "value": merchant_id}
            ],
            "op": "and"
        }],
        "included_categories": {"incoming": ["transaction_share", "action"]},
        "source": [
            "metadata.source",
            "metadata.transaction.id",
            "metadata.transaction.transaction_source.source",
            "metadata.transaction.transaction_source.service",
            "metadata.transaction.order_id",
            "metadata.transaction.transaction_time",
            "metadata.transaction.real_gross_amount",
            "metadata.transaction.payment_type",
            "metadata.transaction.pop.id",
            "metadata.card_type",
            "metadata.transaction_type",
            "metadata.transaction.status",
            "metadata.merchant_mid",
            "metadata.merchant_tid",
            "metadata.merchant_code",
            "metadata.batch_number",
            "metadata.reference_number",
            "metadata.reference_id",
            "metadata.auth_id_response",
            "metadata.transaction_number",
            "metadata.masked_card",
            "metadata.transaction.customer",
            "metadata.transaction.custom_field1",
            "metadata.transaction.custom_field2",
            "metadata.transaction.custom_field3",
            "metadata.transaction.metadata",
            "metadata.acquiring_bank",
            "metadata.on_us",
            "metadata.point_balance"
        ]
    });

    let response = http.post_json(&url, &body, device, Some(access_token), false).await?;

    Ok(response)
}

/// Get user configuration
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token
///
/// # Returns
/// User config response
pub async fn get_user_config(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
) -> Result<Value> {
    let url = format!("{}/goresto/v5/public/users/config", BASE_URL_MERCHANT);

    let params = HashMap::new();
    let response = http.get_json(&url, &params, device, Some(access_token)).await?;

    Ok(response)
}

/// Search merchants
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token
/// * `query` - Search query clauses (empty = all merchants)
/// * `source_fields` - Fields to return (default: ["id"])
///
/// # Returns
/// Merchants response
pub async fn search_merchants(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    query: Option<Vec<Value>>,
    source_fields: Option<Vec<String>>,
) -> Result<Value> {
    let url = format!("{}/v1/merchants/search", BASE_URL_MERCHANT);

    let body = json!({
        "_source": source_fields.unwrap_or_else(|| vec!["id".to_string()]),
        "query": query.unwrap_or_default()
    });

    let response = http.post_json(&url, &body, device, Some(access_token), false).await?;

    Ok(response)
}

/// Get QRIS POPs (Point of Sale) for merchant
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token
/// * `merchant_id` - Merchant ID (e.g. G544166476)
///
/// # Returns
/// QRIS POPs list
pub async fn get_qris_pops(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    merchant_id: &str,
) -> Result<Value> {
    let url = format!("{}/gobiz/merchants/{}/qris_pops", BASE_URL_MERCHANT, merchant_id);

    let params = HashMap::new();
    let response = http.get_json(&url, &params, device, Some(access_token)).await?;

    Ok(response)
}

/// Generate QRIS via Midtrans
///
/// # Arguments
/// * `device` - Device info
/// * `access_token` - Access token
/// * `pop_id` - POP ID from get_qris_pops()
/// * `amount` - Amount in IDR
/// * `order_id` - Custom order ID (auto-generated if None)
///
/// # Returns
/// QRIS data with QR code
pub async fn generate_qris_midtrans(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    pop_id: &str,
    amount: i64,
    order_id: Option<String>,
) -> Result<Value> {
    let url = format!("{}/v2/charge", BASE_URL_QRIS);

    let order_id = order_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let body = json!({
        "payment_type": "qris",
        "transaction_details": {
            "currency": "IDR",
            "gross_amount": amount,
            "order_id": order_id
        },
        "customer_details": {
            "email": "",
            "first_name": "",
            "last_name": "",
            "phone": "",
            "billing_address": {"first_name": "", "last_name": ""},
            "shipping_address": {"first_name": "", "last_name": ""}
        },
        "metadata": {}
    });

    // Build Midtrans-specific headers
    let mut headers = HashMap::new();
    headers.insert("authentication-type".to_string(), "go-id".to_string());
    headers.insert("x-service".to_string(), "GoBiz".to_string());
    headers.insert("x-source".to_string(), "GoBiz-Mobile".to_string());
    headers.insert("x-source-version".to_string(), "5.26.0".to_string());
    headers.insert("x-pop-id".to_string(), pop_id.to_string());

    // Use HttpClient (with cookies) with custom headers
    let result = http.post_json_with_headers(&url, &body, device, Some(access_token), headers).await?;

    Ok(result)
}

/// Get payment status
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token
/// * `order_id` - Order ID from generate_qris_midtrans()
/// * `pop_id` - POP ID used in generation
/// * `if_modified_since` - Optional timestamp for conditional request
///
/// # Returns
/// Payment status data
pub async fn get_payment_status(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    order_id: &str,
    pop_id: &str,
    if_modified_since: Option<&str>,
) -> Result<Value> {
    let url = format!("{}/v2/{}/status", BASE_URL_QRIS, order_id);

    // Build Midtrans-specific headers
    let mut headers = HashMap::new();
    headers.insert("authentication-type".to_string(), "go-id".to_string());
    headers.insert("x-service".to_string(), "GoBiz".to_string());
    headers.insert("x-source".to_string(), "GoBiz-Mobile".to_string());
    headers.insert("x-source-version".to_string(), "5.26.0".to_string());
    headers.insert("x-pop-id".to_string(), pop_id.to_string());

    if let Some(timestamp) = if_modified_since {
        headers.insert("if-modified-since".to_string(), timestamp.to_string());
    }

    // Use HttpClient (with cookies) with custom headers
    let result = http.get_json_with_headers(&url, device, Some(access_token), headers).await?;

    Ok(result)
}

/// Cancel payment
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token
/// * `order_id` - Order ID to cancel
/// * `pop_id` - POP ID used in generation
///
/// # Returns
/// Cancel response
pub async fn cancel_payment(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    order_id: &str,
    pop_id: &str,
) -> Result<Value> {
    let url = format!("{}/v2/{}/cancel", BASE_URL_QRIS, order_id);

    let body = json!({});

    // Build Midtrans-specific headers
    let mut headers = HashMap::new();
    headers.insert("authentication-type".to_string(), "go-id".to_string());
    headers.insert("x-service".to_string(), "GoBiz".to_string());
    headers.insert("x-source".to_string(), "GoBiz-Mobile".to_string());
    headers.insert("x-source-version".to_string(), "5.26.0".to_string());
    headers.insert("x-pop-id".to_string(), pop_id.to_string());

    // Use HttpClient (with cookies) with custom headers
    let result = http.post_json_with_headers(&url, &body, device, Some(access_token), headers).await?;

    Ok(result)
}

/// Get user profile
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token from auth
///
/// # Returns
/// Profile response
pub async fn get_profile(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
) -> Result<Value> {
    let url = format!("{}/api/profile", BASE_URL_MERCHANT);
    
    let params = HashMap::new();
    let response = http.get_json(&url, &params, device, Some(access_token)).await?;
    
    Ok(response)
}

/// Get balance home (finance dashboard)
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token from auth
///
/// # Returns
/// Balance home response with wallet info, balance, and financial summary
pub async fn get_balance_home(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
) -> Result<Value> {
    let url = format!("{}/api/v1/finance/balance/home", BASE_URL_GOPAYMERCHANT);
    
    let params = HashMap::new();
    let response = http.get_json(&url, &params, device, Some(access_token)).await?;
    
    Ok(response)
}

/// Get balance multi-wallet (alternative endpoint)
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token from auth
///
/// # Returns
/// Multi-wallet balance response
pub async fn get_balance_multi_wallet(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
) -> Result<Value> {
    let url = format!("{}/api/v1/finance/balance/multi-wallet", BASE_URL_GOPAYMERCHANT);
    
    let params = HashMap::new();
    let response = http.get_json(&url, &params, device, Some(access_token)).await?;
    
    Ok(response)
}

/// Get wallets balance (Plutus API - CORRECT ENDPOINT)
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `access_token` - Access token from auth
/// * `merchant_id` - Merchant ID (e.g. G746027573)
///
/// # Returns
/// Wallets balance response
pub async fn get_wallets_balance(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    merchant_id: &str,
) -> Result<Value> {
    let url = format!("{}/plutus/api/v1/wallets/balance?currency=IDR&id={}", BASE_URL_MERCHANT, merchant_id);
    
    let params = HashMap::new();
    let response = http.get_json(&url, &params, device, Some(access_token)).await?;
    
    Ok(response)
}
