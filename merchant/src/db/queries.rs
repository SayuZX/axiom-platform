use sqlx::MySqlPool;
use crate::{db::models::{DeviceInfo,GopayToken}, error::{AppError,Result}};
use super::encryption;

pub async fn get_device_info(pool: &MySqlPool, user_id: &str) -> Result<Option<DeviceInfo>> {
    Ok(sqlx::query_as("SELECT * FROM device_info WHERE user_id=?").bind(user_id).fetch_optional(pool).await?)
}
pub async fn create_device_info(pool: &MySqlPool, device: &DeviceInfo) -> Result<()> {
    sqlx::query("INSERT INTO device_info (id,user_id,device_id,device_os,phone_make,phone_model,device_fingerprint,fcm_token,transaction_id) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind(&device.id).bind(&device.user_id).bind(&device.device_id).bind(&device.device_os).bind(&device.phone_make)
        .bind(&device.phone_model).bind(&device.device_fingerprint).bind(&device.fcm_token).bind(&device.transaction_id).execute(pool).await?;
    Ok(())
}
pub async fn get_gopay_token(pool: &MySqlPool, user_id: &str) -> Result<Option<GopayToken>> {
    let result: Option<GopayToken> = sqlx::query_as("SELECT * FROM gopay_tokens WHERE user_id=?").bind(user_id).fetch_optional(pool).await?;
    if let Some(mut token) = result {
        token.access_token = encryption::decrypt(&token.access_token).map_err(AppError::Internal)?;
        token.refresh_token = token.refresh_token.as_deref().map(encryption::decrypt).transpose().map_err(AppError::Internal)?;
        token.cookies = token.cookies.as_deref().map(encryption::decrypt).transpose().map_err(AppError::Internal)?;
        Ok(Some(token))
    } else { Ok(None) }
}
pub async fn upsert_gopay_token(pool: &MySqlPool, token: &GopayToken) -> Result<()> {
    let access = encryption::encrypt(&token.access_token).map_err(AppError::Internal)?;
    let refresh = token.refresh_token.as_deref().map(encryption::encrypt).transpose().map_err(AppError::Internal)?;
    let cookies = token.cookies.as_deref().map(encryption::encrypt).transpose().map_err(AppError::Internal)?;
    sqlx::query("INSERT INTO gopay_tokens (id,user_id,gopay_email,gopay_phone,gopay_account_id,access_token,refresh_token,cookies,expires_at) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE gopay_email=VALUES(gopay_email),gopay_phone=VALUES(gopay_phone),gopay_account_id=VALUES(gopay_account_id),access_token=VALUES(access_token),refresh_token=VALUES(refresh_token),cookies=VALUES(cookies),expires_at=VALUES(expires_at),updated_at=UTC_TIMESTAMP()")
        .bind(&token.id).bind(&token.user_id).bind(&token.gopay_email).bind(&token.gopay_phone).bind(&token.gopay_account_id)
        .bind(access).bind(refresh).bind(cookies).bind(token.expires_at).execute(pool).await?;
    Ok(())
}
