// Utility functions
use rand::Rng;
use uuid::Uuid;

/// Generate API key with prefix
pub fn generate_api_key(prefix: &str) -> String {
    let uuid = Uuid::new_v4().to_string().replace("-", "");
    format!("{}{}", prefix, uuid)
}

/// Generate random hex string
pub fn generate_hex(length: usize) -> String {
    let mut rng = rand::thread_rng();
    (0..length)
        .map(|_| format!("{:x}", rng.gen::<u8>() % 16))
        .collect()
}

/// Generate transaction ID
pub fn generate_transaction_id() -> String {
    Uuid::new_v4().to_string()
}
