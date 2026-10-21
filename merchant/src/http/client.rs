use reqwest::{Client, Method};
use serde_json::Value;
use std::{collections::HashMap, sync::Arc, time::Duration};
use reqwest_cookie_store::{CookieStore, CookieStoreMutex};
use crate::{db::models::DeviceInfo, error::{AppError, Result}};

pub struct HttpClient {
    client: Client,
    cookies: Arc<CookieStoreMutex>,
}
impl HttpClient {
    pub fn new() -> Self {
        let cookies = Arc::new(CookieStoreMutex::new(CookieStore::default()));
        let client = Client::builder().cookie_provider(cookies.clone())
            .redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(30))
            .build().expect("HTTP client configuration");
        Self { client, cookies }
    }
    pub fn get_cookies(&self) -> Result<String> {
        let jar = self.cookies.lock().map_err(|_| AppError::Internal("Cookie lock".into()))?;
        let mut bytes = Vec::new();
        cookie_store::serde::json::save_incl_expired_and_nonpersistent(&jar, &mut bytes)
            .map_err(|_| AppError::Internal("Cookie serialization".into()))?;
        String::from_utf8(bytes).map_err(|_| AppError::Internal("Cookie encoding".into()))
    }
    pub fn set_cookies(&self, value: &str) -> Result<()> {
        if value.is_empty() { return Ok(()); }
        let jar = cookie_store::serde::json::load(std::io::Cursor::new(value))
            .map_err(|_| AppError::Internal("Stored cookies invalid".into()))?;
        *self.cookies.lock().map_err(|_| AppError::Internal("Cookie lock".into()))? = jar;
        Ok(())
    }
    async fn request(&self, method: Method, url: &str, body: Option<&Value>, device: &DeviceInfo, token: Option<&str>, extra: HashMap<String, String>, empty_auth: bool) -> Result<Value> {
        let parsed = reqwest::Url::parse(url).map_err(|_| AppError::Validation("Provider URL invalid".into()))?;
        if parsed.scheme() != "https" || !matches!(parsed.host_str(), Some("accounts.goto-products.com" | "api.gobiz.co.id" | "api.midtrans.com" | "gopaymerchant.midtrans.com")) || !parsed.username().is_empty() || parsed.password().is_some() || parsed.port().is_some() {
            return Err(AppError::Validation("Provider URL forbidden".into()));
        }
        let text = body.map(serde_json::to_string).transpose()?.unwrap_or_default();
        let mut headers = crate::http::headers::build_headers(device, &text, token, "v43ju4qzn0fr2l95docgk", empty_auth);
        headers.extend(extra);
        let mut request = self.client.request(method, parsed);
        for (key, value) in headers { request = request.header(key, value); }
        if body.is_some() { request = request.body(text); }
        let response = request.send().await?;
        if response.status().is_redirection() { return Err(AppError::GopayApi("Provider redirect rejected".into())); }
        // Authentication challenges arrive as structured JSON even on non-2xx responses.
        Ok(response.json::<Value>().await?)
    }
    pub async fn post_json(&self, url: &str, body: &Value, device: &DeviceInfo, token: Option<&str>, empty_auth: bool) -> Result<Value> {
        self.request(Method::POST, url, Some(body), device, token, HashMap::new(), empty_auth).await
    }
    pub async fn post_json_with_headers(&self, url: &str, body: &Value, device: &DeviceInfo, token: Option<&str>, extra: HashMap<String,String>) -> Result<Value> {
        self.request(Method::POST, url, Some(body), device, token, extra, false).await
    }
    pub async fn get_json(&self, url: &str, params: &HashMap<String,String>, device: &DeviceInfo, token: Option<&str>) -> Result<Value> {
        let mut parsed = reqwest::Url::parse(url).map_err(|_| AppError::Validation("Provider URL invalid".into()))?;
        parsed.query_pairs_mut().extend_pairs(params);
        self.request(Method::GET, parsed.as_str(), None, device, token, HashMap::new(), false).await
    }
    pub async fn get_json_with_headers(&self, url: &str, device: &DeviceInfo, token: Option<&str>, extra: HashMap<String,String>) -> Result<Value> {
        self.request(Method::GET, url, None, device, token, extra, false).await
    }
    pub async fn patch_json(&self, url: &str, body: &Value, device: &DeviceInfo, token: Option<&str>) -> Result<Value> {
        self.request(Method::PATCH, url, Some(body), device, token, HashMap::new(), false).await
    }
    pub async fn delete_json(&self, url: &str, device: &DeviceInfo, token: Option<&str>) -> Result<Value> {
        self.request(Method::DELETE, url, None, device, token, HashMap::new(), false).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cookies_are_user_and_domain_scoped_and_survive_restart() {
        let first = HttpClient::new();
        let second = HttpClient::new();
        let auth = reqwest::Url::parse("https://accounts.goto-products.com/").unwrap();
        let merchant = reqwest::Url::parse("https://api.gobiz.co.id/").unwrap();
        first.cookies.lock().expect("cookie jar").parse("session=private; Secure; Path=/", &auth).unwrap();
        assert_eq!(second.cookies.lock().expect("cookie jar").get_request_values(&auth).count(),0);
        assert_eq!(first.cookies.lock().expect("cookie jar").get_request_values(&merchant).count(),0);
        let restored = HttpClient::new();
        restored.set_cookies(&first.get_cookies().unwrap()).unwrap();
        let jar = restored.cookies.lock().expect("cookie jar");
        assert_eq!(jar.get_request_values(&auth).collect::<Vec<_>>(),vec![("session","private")]);
    }
}
