// Encryption utilities for sensitive data
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use std::env;

pub fn get_encryption_key() -> Result<[u8; 32], String> {
    let text = env::var("ENCRYPTION_KEY").map_err(|_| "ENCRYPTION_KEY is required")?;
    parse_key(&text)
}

fn parse_key(text: &str) -> Result<[u8; 32], String> {
    let mut key = [0; 32];
    if text.len() != 64 { return Err("ENCRYPTION_KEY must be 64 hex characters".into()); }
    hex::decode_to_slice(text, &mut key).map_err(|_| "ENCRYPTION_KEY must be 64 hex characters")?;
    Ok(key)
}

/// Encrypt plaintext using AES-256-GCM
/// Returns base64-encoded "nonce:ciphertext"
pub fn encrypt(plaintext: &str) -> Result<String, String> {
    let key = get_encryption_key()?;
    let cipher = Aes256Gcm::new(&key.into());
    
    // Generate random nonce (12 bytes for GCM)
    let nonce_bytes = rand::random::<[u8; 12]>();
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;
    
    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    
    Ok(general_purpose::STANDARD.encode(&combined))
}

/// Decrypt base64-encoded "nonce:ciphertext" using AES-256-GCM
pub fn decrypt(encrypted: &str) -> Result<String, String> {
    let key = get_encryption_key()?;
    let cipher = Aes256Gcm::new(&key.into());
    
    // Decode base64
    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;
    
    if combined.len() < 12 {
        return Err("Invalid encrypted data".to_string());
    }
    
    // Split nonce (first 12 bytes) and ciphertext
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    
    // Decrypt
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;
    
    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {}", e))
}

/// Hash API key with bcrypt (irreversible)
pub fn hash_api_key(api_key: &str) -> Result<String, String> {
    bcrypt::hash(api_key, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Bcrypt hash failed: {}", e))
}

/// Verify API key against hash
pub fn verify_api_key(api_key: &str, hash: &str) -> Result<bool, String> {
    bcrypt::verify(api_key, hash)
        .map_err(|e| format!("Bcrypt verify failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_keys_are_rejected() {
        assert!(parse_key("").is_err());
        assert!(parse_key(&"z".repeat(64)).is_err());
        assert!(parse_key(&"0".repeat(63)).is_err());
    }
}
