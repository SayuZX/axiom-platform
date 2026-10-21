// HTTP headers builder
use crate::crypto::{xe1, xe2, xe3};
use crate::db::models::DeviceInfo;
use std::collections::HashMap;

/// Build complete request headers with crypto signatures
///
/// # Arguments
/// * `device` - Device info (dynamic per user)
/// * `body` - JSON request body (for X-E1, X-E3)
/// * `auth_token` - Optional Bearer token
/// * `service_area` - Gojek service area code
/// * `include_empty_auth` - Force include empty Authorization header
///
/// # Returns
/// Complete headers HashMap
pub fn build_headers(
    device: &DeviceInfo,
    body: &str,
    auth_token: Option<&str>,
    service_area: &str,
    include_empty_auth: bool,
) -> HashMap<String, String> {
    let mut headers = HashMap::new();

    // Static base headers (captured from app)
    headers.insert("Transaction-ID".to_string(), device.transaction_id.clone());
    headers.insert("X-AppId".to_string(), "com.gojek.resto".to_string());
    headers.insert("X-User-Type".to_string(), "merchant".to_string());
    headers.insert("X-Client-Id".to_string(), "go-biz-mobile".to_string());
    headers.insert(
        "X-Client-Secret".to_string(),
        std::env::var("GOPAY_CLIENT_SECRET").expect("Validated GOPAY_CLIENT_SECRET"),
    );
    headers.insert("X-AuthSDK-Version".to_string(), "3.90.0".to_string());
    headers.insert("X-CVSDK-Version".to_string(), "3.62.0".to_string());
    headers.insert("X-AppVersion".to_string(), "5.26.0".to_string());
    headers.insert("X-IMEI".to_string(), "NA".to_string());
    headers.insert("X-Platform".to_string(), "Android".to_string());
    headers.insert("X-User-Locale".to_string(), "id-ID".to_string());
    headers.insert("Accept-Language".to_string(), "id".to_string());
    headers.insert("Accept".to_string(), "application/json".to_string());
    headers.insert("X-PushTokenType".to_string(), "FCM".to_string());
    headers.insert("Gojek-Country-Code".to_string(), "ID".to_string());
    headers.insert("Gojek-Timezone".to_string(), "Asia/Jakarta".to_string());
    headers.insert("authentication-type".to_string(), "go-id".to_string());
    headers.insert("AdjTs".to_string(), "ts:A".to_string());
    headers.insert(
        "Content-Type".to_string(),
        "application/json; charset=UTF-8".to_string(),
    );
    headers.insert("User-Agent".to_string(), "okhttp/4.12.0".to_string());

    // Dynamic device headers (from device_info table)
    headers.insert("X-UniqueId".to_string(), device.device_id.clone());
    headers.insert("X-DeviceOS".to_string(), device.device_os.clone());
    headers.insert("X-PhoneMake".to_string(), device.phone_make.clone());
    headers.insert("X-PhoneModel".to_string(), device.phone_model.clone());
    headers.insert("X-M1".to_string(), device.device_fingerprint.clone());
    if let Some(fcm_token) = &device.fcm_token {
        headers.insert("X-DeviceToken".to_string(), fcm_token.clone());
    }

    // Dynamic service area
    headers.insert("Gojek-Service-Area".to_string(), service_area.to_string());

    // Crypto headers (X-E1, X-E2, X-E3)
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    let x_e1 = xe1::generate_x_e1(body, timestamp);
    let x_e2 = xe2::generate_x_e2();
    let x_e3 = xe3::generate_x_e3(body);

    headers.insert("X-E1".to_string(), x_e1);
    headers.insert("X-E2".to_string(), x_e2);
    headers.insert("X-E3".to_string(), x_e3);

    // Authorization header (optional or empty)
    if let Some(token) = auth_token {
        headers.insert("Authorization".to_string(), format!("Bearer {}", token));
    } else if include_empty_auth {
        headers.insert("Authorization".to_string(), "".to_string());
    }

    headers
}

