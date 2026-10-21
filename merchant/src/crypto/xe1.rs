// X-E1 generator (SHA256 + HMAC)
// Ported from Python x_e1_generator.py

use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// AppInfo structure (13 fields)
pub struct AppInfo {
    pub support_pulsa: String,
    pub support_data_package: String,
    pub support_pln_token: String,
    pub support_e_money: String,
    pub support_pln: String,
    pub support_pdam: String,
    pub support_bpjs: String,
    pub support_internet_cable: String,
    pub support_phone_post_paid: String,
    pub support_multifinance: String,
    pub support_e_invoicing: String,
    pub support_education: String,
    pub support_insurance: String,
}

impl AppInfo {
    /// Create AppInfo with all fields set to "true"
    pub fn new() -> Self {
        Self {
            support_pulsa: "true".to_string(),
            support_data_package: "true".to_string(),
            support_pln_token: "true".to_string(),
            support_e_money: "true".to_string(),
            support_pln: "true".to_string(),
            support_pdam: "true".to_string(),
            support_bpjs: "true".to_string(),
            support_internet_cable: "true".to_string(),
            support_phone_post_paid: "true".to_string(),
            support_multifinance: "true".to_string(),
            support_e_invoicing: "true".to_string(),
            support_education: "true".to_string(),
            support_insurance: "true".to_string(),
        }
    }

    /// Concatenate all fields with separator
    pub fn to_key_material(&self, separator: &str) -> String {
        vec![
            self.support_pulsa.as_str(),
            self.support_data_package.as_str(),
            self.support_pln_token.as_str(),
            self.support_e_money.as_str(),
            self.support_pln.as_str(),
            self.support_pdam.as_str(),
            self.support_bpjs.as_str(),
            self.support_internet_cable.as_str(),
            self.support_phone_post_paid.as_str(),
            self.support_multifinance.as_str(),
            self.support_e_invoicing.as_str(),
            self.support_education.as_str(),
            self.support_insurance.as_str(),
        ]
        .join(separator)
    }
}

impl Default for AppInfo {
    fn default() -> Self {
        Self::new()
    }
}

/// X-E1 Generator
pub struct XE1Generator {
    app_info: AppInfo,
}

impl XE1Generator {
    pub fn new(app_info: AppInfo) -> Self {
        Self { app_info }
    }

    /// Standard HMAC-SHA256
    fn hmac_sha256(data: &[u8], key: &[u8]) -> Vec<u8> {
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
        mac.update(data);
        mac.finalize().into_bytes().to_vec()
    }

    /// Generate random seed (32 bytes)
    fn generate_random_seed() -> Vec<u8> {
        let mut seed = vec![0u8; 32];
        rand::thread_rng().fill_bytes(&mut seed);
        seed
    }

    /// Derive HMAC key from AppInfo fields + random seed
    fn derive_hmac_key(&self, random_seed: &[u8]) -> Vec<u8> {
        let key_material = self.app_info.to_key_material("|");
        Self::hmac_sha256(key_material.as_bytes(), random_seed)
    }

    /// Generate signature via HMAC-SHA256
    fn generate_signature(&self, payload: &str, hmac_key: &[u8], timestamp: i64) -> Vec<u8> {
        let key_material = self.app_info.to_key_material("|");
        let signature_input = format!("{}|{}|{}", timestamp, payload, key_material);
        Self::hmac_sha256(signature_input.as_bytes(), hmac_key)
    }

    /// Generate 80-byte "encrypted" payload
    fn generate_encrypted_payload(&self, payload: &str, hmac_key: &[u8], timestamp: i64) -> Vec<u8> {
        // Generate first 32 bytes from payload HMAC
        let chunk1 = Self::hmac_sha256(payload.as_bytes(), hmac_key);

        // Generate remaining 48 bytes (structured data)
        let mut chunk2 = vec![
            0x3f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 8 bytes
            0x7e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 8 bytes
        ];

        // Add 32 more bytes (mix of timestamp and random)
        let ts_bytes = timestamp.to_le_bytes();
        chunk2.extend_from_slice(&ts_bytes);

        let mut random_bytes = vec![0u8; 24];
        rand::thread_rng().fill_bytes(&mut random_bytes);
        chunk2.extend_from_slice(&random_bytes);

        // Combine all chunks
        let mut result = chunk1;
        result.extend_from_slice(&chunk2);
        result
    }

    /// Generate X-E1 header
    ///
    /// # Arguments
    /// * `payload` - JSON request body
    /// * `timestamp` - Unix timestamp in milliseconds (None = current time)
    ///
    /// # Returns
    /// X-E1 header string: "signature:encrypted:D:timestamp"
    pub fn generate(&self, payload: &str, timestamp: Option<i64>) -> String {
        let timestamp = timestamp.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64
        });

        // Step 1: Generate random seed
        let random_seed = Self::generate_random_seed();

        // Step 2: Derive HMAC key
        let hmac_key = self.derive_hmac_key(&random_seed);

        // Step 3: Generate signature (32 bytes)
        let signature = self.generate_signature(payload, &hmac_key, timestamp);
        let signature_hex = hex::encode(signature);

        // Step 4: Generate encrypted payload (80 bytes)
        let encrypted = self.generate_encrypted_payload(payload, &hmac_key, timestamp);
        let encrypted_hex = hex::encode(encrypted);

        // Step 5: Assemble X-E1
        format!("{}:{}:D:{}", signature_hex, encrypted_hex, timestamp)
    }
}

/// Generate X-E1 header (convenience function)
pub fn generate_x_e1(body: &str, timestamp: i64) -> String {
    let app_info = AppInfo::new();
    let generator = XE1Generator::new(app_info);
    generator.generate(body, Some(timestamp))
}

