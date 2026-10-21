use crate::error::Result;
use crate::http::HttpClient;
use crate::db::models::DeviceInfo;
use serde_json::Value;
use std::collections::HashMap;

const BASE_URL: &str = "https://api.gobiz.co.id";

/// Get user list (paginated)
pub async fn get_user_list(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    page: i32,
    merchant_id: Option<&str>,
) -> Result<Value> {
    let url = format!("{}/v1/users", BASE_URL);
    
    let mut params = HashMap::new();
    params.insert("page".to_string(), page.to_string());
    if let Some(mid) = merchant_id {
        params.insert("merchant_id".to_string(), mid.to_string());
    }
    
    let response = http.get_json(&url, &params, device, Some(access_token)).await?;
    Ok(response)
}

/// Search users
pub async fn search_users(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    search_request: Value,
) -> Result<Value> {
    let url = format!("{}/v2/users/public/search", BASE_URL);
    
    let response = http.post_json(&url, &search_request, device, Some(access_token), false).await?;
    Ok(response)
}

/// Get user details
pub async fn get_user_details(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    user_id: &str,
) -> Result<Value> {
    let url = format!("{}/v1/users/{}", BASE_URL, user_id);
    
    let params = HashMap::new();
    let response = http.get_json(&url, &params, device, Some(access_token)).await?;
    Ok(response)
}

/// Add new user
pub async fn add_user(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    user_request: Value,
) -> Result<Value> {
    let url = format!("{}/v2/users", BASE_URL);
    
    let response = http.post_json(&url, &user_request, device, Some(access_token), false).await?;
    Ok(response)
}

/// Update user information
pub async fn update_user(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    user_id: &str,
    update_request: Value,
) -> Result<Value> {
    let url = format!("{}/v2/users/{}", BASE_URL, user_id);
    
    let response = http.patch_json(&url, &update_request, device, Some(access_token)).await?;
    Ok(response)
}

/// Delete user
pub async fn delete_user(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    user_id: &str,
) -> Result<Value> {
    let url = format!("{}/v1/users/{}", BASE_URL, user_id);
    
    let response = http.delete_json(&url, device, Some(access_token)).await?;
    Ok(response)
}

/// Update user permissions
pub async fn update_user_permissions(
    http: &HttpClient,
    device: &DeviceInfo,
    access_token: &str,
    user_id: &str,
    permissions_request: Value,
) -> Result<Value> {
    let url = format!("{}/api/facets/v1/users/{}/permissions", BASE_URL, user_id);
    
    let response = http.patch_json(&url, &permissions_request, device, Some(access_token)).await?;
    Ok(response)
}
