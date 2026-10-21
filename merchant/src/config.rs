#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub redis_url: String,
    pub webhook_allowed_origin: String,
    pub owner_setup_key: [u8; 32],
}
impl Config {
    pub fn from_env() -> Result<Self, String> {
        dotenvy::dotenv().ok();
        crate::db::encryption::get_encryption_key()?;
        let required = |name: &str| std::env::var(name).ok().filter(|s| !s.trim().is_empty()).ok_or_else(|| format!("{name} is required"));
        let origin = required("WEBHOOK_ALLOWED_ORIGIN")?;
        if origin != "https://ai.axiomcreative.xyz" { return Err("WEBHOOK_ALLOWED_ORIGIN must be https://ai.axiomcreative.xyz".into()); }
        required("GOPAY_CLIENT_SECRET")?;
        let mut owner_setup_key = [0u8; 32];
        hex::decode_to_slice(required("OWNER_SETUP_KEY")?, &mut owner_setup_key)
            .map_err(|_| "OWNER_SETUP_KEY must be exactly 64 hexadecimal characters")?;
        Ok(Self {
            port: std::env::var("PORT").unwrap_or_else(|_| "3082".into()).parse().map_err(|_| "PORT invalid")?,
            database_url: required("DATABASE_URL")?,
            redis_url: required("REDIS_URL")?,
            webhook_allowed_origin: origin,
            owner_setup_key,
        })
    }
}
