use crate::error::Result;
use crate::http::HttpClient;
use crate::db::models::DeviceInfo;
use serde_json::Value;

const BASE_URL: &str = "https://api.gobiz.co.id";

/// Search journals (transaction history)
pub async fn search_journals(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    search_request: Value,
) -> Result<Value> {
    let url = format!("{}/journals/search", BASE_URL);
    
    let response = http.post_json(&url, &search_request, device, Some(access_token), false).await?;
    Ok(response)
}

/// Get transaction analytics
pub async fn get_transaction_analytics(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    merchant_id: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
    min_amount: Option<i64>,
    max_amount: Option<i64>,
) -> Result<Value> {
    let url = format!("{}/merchant-analytics/v2/merchants/transactions", BASE_URL);
    
    let mut query_params = vec![
        format!("merchant_id={}", merchant_id),
    ];
    
    if let Some(start) = start_date {
        query_params.push(format!("start_date={}", start));
    }
    if let Some(end) = end_date {
        query_params.push(format!("end_date={}", end));
    }
    if let Some(min) = min_amount {
        query_params.push(format!("min_amount={}", min));
    }
    if let Some(max) = max_amount {
        query_params.push(format!("max_amount={}", max));
    }
    
    let full_url = if query_params.is_empty() {
        url
    } else {
        format!("{}?{}", url, query_params.join("&"))
    };
    
    let params = std::collections::HashMap::new();
    let response = http.get_json(&full_url, &params, device, Some(access_token)).await?;
    Ok(response)
}

/// Get wallet summary
pub async fn get_wallet_summary(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    merchant_id: &str,
    start_time: Option<&str>,
    end_time: Option<&str>,
) -> Result<Value> {
    let url = format!("{}/plutus/api/v1/wallets/summary", BASE_URL);
    
    let mut query_params = vec![
        format!("id={}", merchant_id),
        "currency=IDR".to_string(),
    ];
    
    if let Some(start) = start_time {
        query_params.push(format!("start_time={}", start));
    }
    if let Some(end) = end_time {
        query_params.push(format!("end_time={}", end));
    }
    
    let full_url = format!("{}?{}", url, query_params.join("&"));
    
    let params = std::collections::HashMap::new();
    let response = http.get_json(&full_url, &params, device, Some(access_token)).await?;
    Ok(response)
}

/// Get aggregated payments report
pub async fn get_aggregated_payments(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    report_request: Value,
) -> Result<Value> {
    let url = format!("{}/v2/payments/aggregated", BASE_URL);
    
    let response = http.post_json(&url, &report_request, device, Some(access_token), false).await?;
    Ok(response)
}
