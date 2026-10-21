// High-level GoPay API wrapper
use sqlx::MySqlPool;
use serde_json::Value;
use std::sync::Arc;

use crate::db::models::{DeviceInfo, GopayToken};
use crate::device;
use crate::error::{AppError, Result};
use crate::gopay::{auth, merchant};
use crate::http::client::HttpClient;

/// GoPay API Client
pub struct GopayClient {
    http: Arc<HttpClient>,
    db: MySqlPool,
    redis: redis::aio::ConnectionManager,
    user_id: String,
    email: String,  // ← ADD EMAIL
    phone: String,  // ← ADD PHONE
    device: Option<DeviceInfo>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    account_id: Option<String>,
}

impl GopayClient {
    /// Create new GoPay client
    pub fn new(http: Arc<HttpClient>, db: MySqlPool, redis: redis::aio::ConnectionManager, user_id: String, email: String, phone: String) -> Self {
        Self {
            http,
            db,
            redis,
            user_id,
            email,
            phone,
            device: None,
            access_token: None,
            refresh_token: None,
            account_id: None,
        }
    }

    /// Get user_id
    pub fn user_id(&self) -> &str {
        &self.user_id
    }

    /// Initialize device info (load from DB or generate new)
    pub async fn init_device(&mut self) -> Result<()> {
        // Try load from DB
        let device = crate::db::queries::get_device_info(&self.db, &self.user_id).await?;

        if let Some(device) = device {
            self.device = Some(device);
        } else {
            // Generate new device
            let device = device::generate_device_info(self.user_id.clone());
            crate::db::queries::create_device_info(&self.db, &device).await?;
            self.device = Some(device);
        }

        Ok(())
    }
    
    /// Save session state to Redis

    /// Load tokens from database
    pub async fn load_tokens(&mut self) -> Result<bool> {
        let token = crate::db::queries::get_gopay_token(&self.db, &self.user_id).await?;

        if let Some(token) = token {
            self.access_token = Some(token.access_token);
            self.refresh_token = token.refresh_token;
            self.account_id = Some(token.gopay_account_id);
            
            // Load cookies into HttpClient
            if let Some(cookies) = token.cookies {
                self.http.set_cookies(&cookies)?;
            }
            
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Save tokens to database with cookies
    pub async fn save_tokens(&mut self, access_token: &str, refresh_token: &str, account_id: &str) -> Result<()> {
        self.access_token = Some(access_token.to_owned());
        self.refresh_token = Some(refresh_token.to_owned());
        self.account_id = Some(account_id.to_owned());
        let cookies = self.http.get_cookies()?;
        
        let token = GopayToken {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: self.user_id.clone(),
            gopay_email: self.email.clone(),  // ← USE self.email
            gopay_phone: self.phone.clone(),  // ← USE self.phone
            gopay_account_id: account_id.to_string(),
            merchant_id: None,  // ← Will be populated below
            access_token: access_token.to_string(),
            refresh_token: Some(refresh_token.to_string()),
            cookies: Some(cookies),  // ← SAVE COOKIES!
            expires_at: chrono::Utc::now() + chrono::Duration::hours(24),
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };

        crate::db::queries::upsert_gopay_token(&self.db, &token).await?;

        self.populate_merchant_id().await?;

        Ok(())
    }

    /// Auto-populate merchant_id from user-config API
    async fn populate_merchant_id(&self) -> Result<()> {
        // Fetch user config to get merchant_id (without mutable borrow)
        let device = self.get_device()?;
        let config = merchant::get_user_config(&self.http, device, self.get_access_token()?).await?;
        
        let merchant_id = config.get("merchant").and_then(|m| m.get("id")).and_then(|id| id.as_str());
        
        // Update merchant_id in database
        sqlx::query("UPDATE gopay_tokens SET merchant_id = ? WHERE user_id = ?")
            .bind(merchant_id)
            .bind(&self.user_id)
            .execute(&self.db)
            .await?;
        
        Ok(())
    }

    /// Get device info (must call init_device first)
    pub fn get_device(&self) -> Result<&DeviceInfo> {
        self.device.as_ref().ok_or_else(|| {
            AppError::Internal("Device not initialized. Call init_device() first.".to_string())
        })
    }

    /// Get access token (must be authenticated)
    fn get_access_token(&self) -> Result<&str> {
        self.access_token.as_deref().ok_or_else(|| {
            AppError::Authentication("Not authenticated. Login first.".to_string())
        })
    }

    // ========== AUTH METHODS ==========

    /// Step 1: Get login methods
    pub async fn login_methods(&self, email: Option<&str>, phone: Option<&str>, country_code: Option<&str>) -> Result<auth::LoginMethodsResponse> {
        let device = self.get_device()?;
        let result = auth::login_methods(&self.http, device, email, phone, country_code).await?;
        Ok(result)
    }

    /// Step 2: Initiate OTP
    pub async fn otp_initiate(
        &self,
        verification_id: &str,
        email: Option<&str>,
        phone: Option<&str>,
        method: &str,
    ) -> Result<auth::OtpInitiateResponse> {
        let device = self.get_device()?;
        let result = auth::otp_initiate(&self.http, device, verification_id, email, phone, method).await?;
        Ok(result)
    }

    /// Step 3: Verify OTP
    pub async fn otp_verify(
        &self,
        verification_id: &str,
        otp_code: &str,
        otp_token: &str,
        email: Option<&str>,
        method: &str,
    ) -> Result<auth::OtpVerifyResponse> {
        let device = self.get_device()?;
        let result = auth::otp_verify(&self.http, device, verification_id, otp_code, otp_token, email, method).await?;
        Ok(result)
    }

    /// Step 4: Get account list
    pub async fn get_account_list(&self, verification_token: &str) -> Result<auth::AccountListResponse> {
        let device = self.get_device()?;
        let result = auth::get_account_list(&self.http, device, verification_token).await?;
        Ok(result)
    }

    /// Step 5: Exchange 1FA to 2FA
    pub async fn exchange_1fa_to_2fa(&self, account_id: &str, fa1_token: &str) -> Result<auth::Exchange1FAResponse> {
        let device = self.get_device()?;
        auth::exchange_1fa_to_2fa(&self.http, device, account_id, fa1_token).await
    }

    /// Step 6: Initiate 2FA OTP
    pub async fn initiate_2fa_otp(
        &self,
        email: &str,
        verification_id: &str,
        method: &str,
    ) -> Result<auth::Initiate2FAResponse> {
        let device = self.get_device()?;
        auth::initiate_2fa_otp(&self.http, device, email, verification_id, method).await
    }

    /// Step 7: Verify 2FA OTP
    pub async fn verify_2fa_otp(
        &self,
        otp_code: &str,
        otp_token: &str,
        verification_id: &str,
        method: &str,
    ) -> Result<auth::Verify2FAResponse> {
        let device = self.get_device()?;
        auth::verify_2fa_otp(&self.http, device, otp_code, otp_token, verification_id, method).await
    }

    /// Step 8: Exchange 2FA to full access
    pub async fn exchange_2fa_to_full_access(
        &mut self,
        account_id: &str,
        fa2_token: &str,
        verification_token: &str,
    ) -> Result<auth::Exchange2FAResponse> {
        let device = self.get_device()?;
        let response = auth::exchange_2fa_to_full_access(&self.http, device, account_id, fa2_token, verification_token).await?;

        // Save tokens
        if response.success {
            if let Some(data) = &response.data {
                self.save_tokens(&data.access_token, &data.refresh_token, account_id).await?;
            }
        }

        Ok(response)
    }

    // ========== MERCHANT METHODS ==========

    /// Get account balance
    pub async fn get_balance(&mut self, account_id: &str) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::get_balance(&self.http, device, token, account_id).await
    }

    /// Search transaction journals
    pub async fn search_journals(
        &mut self,
        merchant_id: &str,
        from_date: &str,
        to_date: &str,
        size: i32,
        from_offset: i32,
    ) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::search_journals(&self.http, device, token, merchant_id, from_date, to_date, size, from_offset).await
    }

    /// Get user configuration
    pub async fn get_user_config(&mut self) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::get_user_config(&self.http, device, token).await
    }

    /// Get user profile
    pub async fn get_profile(&mut self) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::get_profile(&self.http, device, token).await
    }

    /// Search merchants
    pub async fn search_merchants(
        &mut self,
        query: Option<Vec<Value>>,
        source_fields: Option<Vec<String>>,
    ) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::search_merchants(&self.http, device, token, query, source_fields).await
    }

    /// Get QRIS POPs
    pub async fn get_qris_pops(&mut self, merchant_id: &str) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::get_qris_pops(&self.http, device, token, merchant_id).await
    }

    /// Generate QRIS via Midtrans
    pub async fn generate_qris_midtrans(
        &mut self,
        pop_id: &str,
        amount: i64,
        order_id: Option<String>,
    ) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::generate_qris_midtrans(&self.http, device, token, pop_id, amount, order_id).await
    }

    /// Get payment status
    pub async fn get_payment_status(
        &mut self,
        order_id: &str,
        pop_id: &str,
        if_modified_since: Option<&str>,
    ) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::get_payment_status(&self.http, device, token, order_id, pop_id, if_modified_since).await
    }

    /// Cancel payment
    pub async fn cancel_payment(
        &mut self,
        order_id: &str,
        pop_id: &str,
    ) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::cancel_payment(&self.http, device, token, order_id, pop_id).await
    }

    /// Check token expiry and auto refresh if needed
    /// Call this before any API request that needs access_token
    pub async fn check_and_refresh_token(&mut self) -> Result<()> {
        // Get token from database
        let token_opt = crate::db::queries::get_gopay_token(&self.db, &self.user_id).await?;
        
        let token = match token_opt {
            Some(t) => t,
            None => {
                // No token in database, user needs to login first
                return Err(AppError::Authentication("No access token found. Please login first.".to_string()));
            }
        };

        // Check if token will expire in < 5 minutes
        let now = chrono::Utc::now();
        let time_left = token.expires_at.signed_duration_since(now);
        let seconds_left = time_left.num_seconds();

        if seconds_left < 300 {
            // Token expired or will expire soon, refresh it

            let refresh_token = token.refresh_token
                .ok_or_else(|| AppError::Internal("No refresh token available".to_string()))?;

            // Call refresh_access_token
            let device = self.get_device()?;
            let refresh_result = auth::refresh_access_token(&self.http, device, &refresh_token).await?;

            if !refresh_result.success {
                return Err(AppError::Authentication("Failed to refresh token".to_string()));
            }

            let data = refresh_result.data
                .ok_or_else(|| AppError::Internal("No data in refresh response".to_string()))?;

            // Update database with new tokens
            self.save_tokens(&data.access_token, &data.refresh_token, &token.gopay_account_id).await?;

            // Update in-memory tokens
            self.access_token = Some(data.access_token.clone());
            self.refresh_token = Some(data.refresh_token.clone());

        } else {
            // Token still valid, load into memory if not already
            self.access_token = Some(token.access_token);
            self.refresh_token = token.refresh_token;
            self.account_id = Some(token.gopay_account_id);
        }

        Ok(())
    }

    /// Refresh access token manually
    pub async fn refresh_access_token(&mut self, refresh_token: &str) -> Result<auth::RefreshTokenResponse> {
        let device = self.get_device()?;
        auth::refresh_access_token(&self.http, device, refresh_token).await
    }

    /// Get balance home (finance dashboard)
    pub async fn get_balance_home(&mut self) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::get_balance_home(&self.http, device, token).await
    }

    /// Get balance multi-wallet (alternative endpoint)
    pub async fn get_balance_multi_wallet(&mut self) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        merchant::get_balance_multi_wallet(&self.http, device, token).await
    }

    /// Get wallets balance v2 (working endpoint)
    pub async fn get_wallets_balance_v2(&mut self) -> Result<Value> {
        // Auto refresh token if needed
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        // Get merchant_id from database
        let merchant_id: Option<String> = sqlx::query_scalar(
            "SELECT merchant_id FROM gopay_tokens WHERE user_id = ? LIMIT 1"
        )
        .bind(&self.user_id)
        .fetch_optional(&self.db)
        .await?;
        
        let merchant_id = merchant_id
            .ok_or_else(|| AppError::Internal("No merchant_id found for user".to_string()))?;
        
        merchant::get_wallets_balance(&self.http, device, token, &merchant_id).await
    }

    // ========== USER MANAGEMENT METHODS ==========

    /// Get user list (paginated)
    pub async fn get_user_list(&mut self, page: i32, merchant_id: Option<&str>) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        crate::gopay::users::get_user_list(&self.http, device, token, page, merchant_id).await
    }

    /// Search users
    pub async fn search_users(&mut self, search_request: Value) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        crate::gopay::users::search_users(&self.http, device, token, search_request).await
    }

    /// Get user details
    pub async fn get_user_details(&mut self, user_id: &str) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        crate::gopay::users::get_user_details(&self.http, device, token, user_id).await
    }

    /// Add new user
    pub async fn add_user(&mut self, user_request: Value) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        crate::gopay::users::add_user(&self.http, device, token, user_request).await
    }

    /// Update user
    pub async fn update_user(&mut self, user_id: &str, update_request: Value) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        crate::gopay::users::update_user(&self.http, device, token, user_id, update_request).await
    }

    /// Delete user
    pub async fn delete_user(&mut self, user_id: &str) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        crate::gopay::users::delete_user(&self.http, device, token, user_id).await
    }

    /// Update user permissions
    pub async fn update_user_permissions(&mut self, user_id: &str, permissions_request: Value) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        crate::gopay::users::update_user_permissions(&self.http, device, token, user_id, permissions_request).await
    }

    // ========== TRANSACTION METHODS ==========

    /// Search journals (transaction history)
    pub async fn search_journals_v2(&mut self, search_request: Value) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        crate::gopay::transactions::search_journals(&self.http, device, token, search_request).await
    }

    /// Get transaction analytics
    pub async fn get_transaction_analytics(
        &mut self,
        start_date: Option<&str>,
        end_date: Option<&str>,
        min_amount: Option<i64>,
        max_amount: Option<i64>,
    ) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        // Get merchant_id from database
        let merchant_id: Option<String> = sqlx::query_scalar(
            "SELECT merchant_id FROM gopay_tokens WHERE user_id = ? LIMIT 1"
        )
        .bind(&self.user_id)
        .fetch_optional(&self.db)
        .await?;
        
        let merchant_id = merchant_id
            .ok_or_else(|| AppError::Internal("No merchant_id found for user".to_string()))?;
        
        crate::gopay::transactions::get_transaction_analytics(
            &self.http,
            device,
            token,
            &merchant_id,
            start_date,
            end_date,
            min_amount,
            max_amount,
        ).await
    }

    /// Get wallet summary
    pub async fn get_wallet_summary_v2(
        &mut self,
        start_time: Option<&str>,
        end_time: Option<&str>,
    ) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        // Get merchant_id from database
        let merchant_id: Option<String> = sqlx::query_scalar(
            "SELECT merchant_id FROM gopay_tokens WHERE user_id = ? LIMIT 1"
        )
        .bind(&self.user_id)
        .fetch_optional(&self.db)
        .await?;
        
        let merchant_id = merchant_id
            .ok_or_else(|| AppError::Internal("No merchant_id found for user".to_string()))?;
        
        crate::gopay::transactions::get_wallet_summary(
            &self.http,
            device,
            token,
            &merchant_id,
            start_time,
            end_time,
        ).await
    }

    /// Get aggregated payments report
    pub async fn get_aggregated_payments(&mut self, report_request: Value) -> Result<Value> {
        self.check_and_refresh_token().await?;
        
        let device = self.get_device()?;
        let token = self.get_access_token()?;
        
        crate::gopay::transactions::get_aggregated_payments(&self.http, device, token, report_request).await
    }
}
