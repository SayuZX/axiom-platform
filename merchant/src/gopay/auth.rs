// GoPay authentication flow (step 1-8)
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::models::DeviceInfo;
use crate::error::{AppError, Result};
use crate::http::client::HttpClient;

/// Base URLs
const BASE_URL_AUTH: &str = "https://accounts.goto-products.com";

/// Client credentials
const CLIENT_ID: &str = "go-biz-mobile";
fn client_secret() -> Result<String> {
    std::env::var("GOPAY_CLIENT_SECRET").ok().filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Internal("GOPAY_CLIENT_SECRET required".into()))
}

/// Step 1: Get available login methods
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `email` - Email address (optional)
/// * `phone` - Phone number (optional)
/// * `country_code` - Country code (default: +62)
///
/// # Returns
/// LoginMethodsResponse with verification_id and methods
#[derive(Debug, Serialize, Deserialize)]
pub struct LoginMethodsResponse {
    pub success: bool,
    pub data: Option<LoginMethodsData>,
    pub errors: Option<Vec<ApiError>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginMethodsData {
    pub verification_id: String,
    pub methods: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiError {
    pub message: String,
    #[serde(flatten)]
    pub details: std::collections::HashMap<String, Value>,
}

pub async fn login_methods(
    http: &HttpClient,
    device: &DeviceInfo,
    email: Option<&str>,
    phone: Option<&str>,
    country_code: Option<&str>,
) -> Result<LoginMethodsResponse> {
    let url = format!("{}/goto-auth/login/methods", BASE_URL_AUTH);

    let body = json!({
        "client_id": CLIENT_ID,
        "client_secret": client_secret()?,
        "country_code": country_code.unwrap_or(if phone.is_some() { "+62" } else { "" }),
        "device_verification_token_id": "",
        "email": email.unwrap_or(""),
        "phone_number": phone.unwrap_or("")
    });

    let response = http.post_json(&url, &body, device, None, false).await?;

    let result: LoginMethodsResponse = serde_json::from_value(response)
        .map_err(|e| AppError::Internal(format!("Failed to parse login_methods response: {}", e)))?;

    Ok(result)
}

/// Step 2: Initiate OTP request
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `verification_id` - From step 1
/// * `email` - Email address (for otp_email)
/// * `phone` - Phone number (for otp_sms/otp_wa)
/// * `method` - OTP method (otp_email, otp_sms, otp_wa)
///
/// # Returns
/// OtpInitiateResponse with otp_token
#[derive(Debug, Serialize, Deserialize)]
pub struct OtpInitiateResponse {
    pub success: bool,
    pub data: Option<OtpInitiateData>,
    pub errors: Option<Vec<ApiError>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OtpInitiateData {
    pub otp_token: String,
    pub metadata: Option<Value>,
}

pub async fn otp_initiate(
    http: &HttpClient,
    device: &DeviceInfo,
    verification_id: &str,
    email: Option<&str>,
    phone: Option<&str>,
    method: &str,
) -> Result<OtpInitiateResponse> {
    let url = format!("{}/cvs/v1/initiate", BASE_URL_AUTH);

    let body = json!({
        "client_id": CLIENT_ID,
        "client_secret": client_secret()?,
        "email_address": email.unwrap_or(""),
        "phone_number": phone.unwrap_or(""),
        "flow": "login_1fa",
        "verification_id": verification_id,
        "verification_method": method
    });

    let response = http.post_json(&url, &body, device, None, true).await?;

    let result: OtpInitiateResponse = serde_json::from_value(response)
        .map_err(|e| AppError::Internal(format!("Failed to parse otp_initiate response: {}", e)))?;

    Ok(result)
}

/// Step 3: Verify OTP code
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `verification_id` - From step 1
/// * `otp_code` - 4-digit (SMS) or 6-digit (email) OTP
/// * `otp_token` - From step 2
/// * `email` - Email address (for otp_email)
/// * `method` - OTP method
///
/// # Returns
/// OtpVerifyResponse with verification_token or access_token
#[derive(Debug, Serialize, Deserialize)]
pub struct OtpVerifyResponse {
    pub success: bool,
    pub data: Option<OtpVerifyData>,
    pub errors: Option<Vec<ApiError>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OtpVerifyData {
    pub verification_token: Option<String>,
    pub access_token: Option<String>,
}

pub async fn otp_verify(
    http: &HttpClient,
    device: &DeviceInfo,
    verification_id: &str,
    otp_code: &str,
    otp_token: &str,
    email: Option<&str>,
    method: &str,
) -> Result<OtpVerifyResponse> {
    let url = format!("{}/cvs/v1/verify", BASE_URL_AUTH);

    let mut body = json!({
        "client_id": CLIENT_ID,
        "client_secret": client_secret()?,
        "data": {
            "otp": otp_code,
            "otp_token": otp_token
        },
        "flow": "login_1fa",
        "verification_id": verification_id,
        "verification_method": method
    });

    // Add email_address for otp_email method
    if method == "otp_email" {
        if let Some(email_val) = email {
            body["email_address"] = json!(email_val);
        }
    }

    let response = http.post_json(&url, &body, device, None, false).await?;

    let result: OtpVerifyResponse = serde_json::from_value(response)
        .map_err(|e| AppError::Internal(format!("Failed to parse otp_verify response: {}", e)))?;

    Ok(result)
}

/// Step 4: Get account list and 1FA token
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `verification_token` - From step 3
///
/// # Returns
/// AccountListResponse with account_list and 1fa_token
#[derive(Debug, Serialize, Deserialize)]
pub struct AccountListResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub success: Option<bool>,
    pub data: Option<AccountListData>,
    pub errors: Option<Vec<ApiError>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountListData {
    pub account_list: Option<Vec<Account>>,
    pub accounts: Option<Vec<Account>>,
    #[serde(rename = "1fa_token")]
    pub fa1_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Account {
    pub account_id: Option<String>,
    pub id: Option<String>,
    pub name: Option<String>,
}

pub async fn get_account_list(
    http: &HttpClient,
    device: &DeviceInfo,
    verification_token: &str,
) -> Result<AccountListResponse> {
    let url = format!("{}/goto-auth/accountlist", BASE_URL_AUTH);

    let body = json!({
        "client_id": CLIENT_ID,
        "client_secret": client_secret()?
    });

    // Build extra headers
    let mut extra_headers = std::collections::HashMap::new();
    extra_headers.insert(
        "Verification-Token".to_string(),
        format!("Bearer {}", verification_token),
    );

    // Use HttpClient wrapper (consistent with steps 1-3)
    let response = http
        .post_json_with_headers(&url, &body, device, None, extra_headers)
        .await?;

    let result: AccountListResponse = serde_json::from_value(response)
        .map_err(|e| AppError::Internal(format!("Failed to parse account_list response: {}", e)))?;

    Ok(result)
}

/// Step 5: Exchange 1FA token to 2FA challenge (or full access if no 2FA)
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `account_id` - From step 4
/// * `fa1_token` - From step 4
///
/// # Returns
/// Exchange1FAResponse with verification_id (2FA) or access_token (no 2FA)
#[derive(Debug, Serialize, Deserialize)]
pub struct Exchange1FAResponse {
    pub success: bool,
    pub data: Option<Exchange1FAData>,
    pub errors: Option<Vec<Exchange1FAError>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Exchange1FAData {
    pub verification_id: Option<String>,
    #[serde(rename = "2fa_token")]
    pub fa2_token: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    #[serde(flatten)]
    pub details: std::collections::HashMap<String, Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Exchange1FAError {
    pub message: String,
    pub verification_id: Option<String>,
    #[serde(flatten)]
    pub details: std::collections::HashMap<String, Value>,
}

pub async fn exchange_1fa_to_2fa(
    http: &HttpClient,
    device: &DeviceInfo,
    account_id: &str,
    fa1_token: &str,
) -> Result<Exchange1FAResponse> {
    let url = format!("{}/goto-auth/token", BASE_URL_AUTH);

    let body = json!({
        "account_id": account_id,
        "client_id": CLIENT_ID,
        "client_secret": client_secret()?,
        "grant_type": "cvs",
        "token": fa1_token
    });

    let response = http.post_json(&url, &body, device, None, false).await?;

    let result: Exchange1FAResponse = serde_json::from_value(response)
        .map_err(|e| AppError::Internal(format!("Failed to parse exchange_1fa response: {}", e)))?;

    Ok(result)
}

/// Step 6: Initiate the provider-supported 2FA OTP method.
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `email` - User email
/// * `verification_id` - From step 5
/// * `method` - otp_sms or otp_wa
///
/// # Returns
/// Initiate2FAResponse with otp_token
#[derive(Debug, Serialize, Deserialize)]
pub struct Initiate2FAResponse {
    pub success: bool,
    pub data: Option<Initiate2FAData>,
    pub errors: Option<Vec<ApiError>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Initiate2FAData {
    pub otp_token: String,
    pub fr_token_details: Option<Value>,
}

pub async fn initiate_2fa_otp(
    http: &HttpClient,
    device: &DeviceInfo,
    email: &str,
    verification_id: &str,
    method: &str,
) -> Result<Initiate2FAResponse> {
    let url = format!("{}/cvs/v1/initiate", BASE_URL_AUTH);

    let body = json!({
        "client_id": CLIENT_ID,
        "client_secret": client_secret()?,
        "email_address": email,
        "flow": "login_2fa",
        "verification_id": verification_id,
        "verification_method": method
    });

    let response = http.post_json(&url, &body, device, None, false).await?;

    let result: Initiate2FAResponse = serde_json::from_value(response)
        .map_err(|e| AppError::Internal(format!("Failed to parse initiate_2fa response: {}", e)))?;

    Ok(result)
}

/// Step 7: Verify 2FA OTP
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `otp_code` - 4-digit OTP
/// * `otp_token` - From step 6
/// * `verification_id` - From step 5
/// * `method` - otp_sms or otp_wa
///
/// # Returns
/// Verify2FAResponse with verification_token and access_token
#[derive(Debug, Serialize, Deserialize)]
pub struct Verify2FAResponse {
    pub success: bool,
    pub data: Option<Verify2FAData>,
    pub errors: Option<Vec<ApiError>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Verify2FAData {
    pub verification_token: String,
    #[serde(default)]
    pub access_token: Option<String>,
}

pub async fn verify_2fa_otp(
    http: &HttpClient,
    device: &DeviceInfo,
    otp_code: &str,
    otp_token: &str,
    verification_id: &str,
    method: &str,
) -> Result<Verify2FAResponse> {
    let url = format!("{}/cvs/v1/verify", BASE_URL_AUTH);

    let body = json!({
        "client_id": CLIENT_ID,
        "client_secret": client_secret()?,
        "data": {
            "otp": otp_code,
            "otp_token": otp_token
        },
        "flow": "login_2fa",
        "verification_id": verification_id,
        "verification_method": method
    });

    let response = http.post_json(&url, &body, device, None, false).await?;

    let result: Verify2FAResponse = serde_json::from_value(response)
        .map_err(|e| AppError::Internal(format!("Failed to parse verify_2fa response: {}", e)))?;

    Ok(result)
}

/// Step 8: Exchange 2FA token for full access
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `account_id` - Account ID
/// * `fa2_token` - From step 6
/// * `verification_token` - From step 7
///
/// # Returns
/// Exchange2FAResponse with access_token and refresh_token
#[derive(Debug, Serialize, Deserialize)]
pub struct Exchange2FAResponse {
    pub success: bool,
    pub data: Option<Exchange2FAData>,
    pub errors: Option<Vec<ApiError>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Exchange2FAData {
    pub access_token: String,
    pub refresh_token: String,
}

pub async fn exchange_2fa_to_full_access(
    http: &HttpClient,
    device: &DeviceInfo,
    account_id: &str,
    fa2_token: &str,
    verification_token: &str,
) -> Result<Exchange2FAResponse> {
    let url = format!("{}/goto-auth/token", BASE_URL_AUTH);

    let body = json!({
        "account_id": account_id,
        "client_id": CLIENT_ID,
        "client_secret": client_secret()?,
        "grant_type": "challenge",
        "token": fa2_token
    });

    let mut headers = std::collections::HashMap::new();
    headers.insert("Verification-Token".into(), format!("Bearer {}", verification_token));
    let response = http.post_json_with_headers(&url, &body, device, None, headers).await?;
    let result: Exchange2FAResponse = serde_json::from_value(response)?;

    Ok(result)
}

/// Step 9: Refresh access token using refresh_token
///
/// # Arguments
/// * `http` - HTTP client
/// * `device` - Device info
/// * `refresh_token` - Refresh token from step 5 or 8
///
/// # Returns
/// RefreshTokenResponse with new access_token and refresh_token
#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshTokenResponse {
    pub success: bool,
    pub data: Option<RefreshTokenData>,
    pub errors: Option<Vec<ApiError>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshTokenData {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: Option<String>,
    pub expires_in: Option<i64>,
}

pub async fn refresh_access_token(
    http: &HttpClient,
    device: &DeviceInfo,
    refresh_token: &str,
) -> Result<RefreshTokenResponse> {
    let url = format!("{}/goto-auth/token", BASE_URL_AUTH);

    let body = json!({
        "client_id": CLIENT_ID,
        "client_secret": client_secret()?,
        "grant_type": "refresh_token",
        "token": refresh_token
    });

    let response = http
        .post_json(&url, &body, device, None, false)
        .await?;

    let result: RefreshTokenResponse = serde_json::from_value(response)
        .map_err(|e| AppError::Internal(format!("Failed to parse refresh_token response: {}", e)))?;

    Ok(result)
}
