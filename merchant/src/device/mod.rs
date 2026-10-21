// Device info generator
use crate::db::models::DeviceInfo;
use rand::seq::SliceRandom;
use rand::Rng;
use base64::Engine;

pub fn generate_device_info(user_id: String) -> DeviceInfo {
    let mut rng = rand::thread_rng();

    // Generate device_id (16 hex chars)
    let device_id: String = (0..16)
        .map(|_| format!("{:x}", rng.gen::<u8>() % 16))
        .collect();

    // Random Android version (10-14)
    let android_version = rng.gen_range(10..=14);
    let device_os = format!("Android,{}", android_version);

    // Random phone brand & model
    let brands = vec![
        ("Xiaomi", vec!["POCO M2012K11AG", "Redmi Note 11", "Mi 11"]),
        ("Samsung", vec!["Galaxy S21", "Galaxy A52", "Galaxy M32"]),
        ("Oppo", vec!["Reno 6", "A74", "Find X3"]),
        ("Vivo", vec!["V21", "Y33s", "X70"]),
    ];
    let (phone_make, models) = brands.choose(&mut rng).unwrap();
    let phone_model = models.choose(&mut rng).unwrap();

    // Generate X-M1 (device fingerprint)
    let timestamp = chrono::Utc::now().timestamp_millis();
    let random_id: u64 = rng.gen();
    let device_fingerprint = format!(
        "2:UNKNOWN,3:{}-{},4:108845,5:kona|1804|8,6:UNKNOWN,7:<unknown ssid>,8:1080x2276,9:,10:1,11:M/{}",
        timestamp,
        random_id,
        base64::engine::general_purpose::STANDARD.encode(&device_id)
    );


    DeviceInfo {
        id: uuid::Uuid::new_v4().to_string(),
        user_id,
        device_id,
        device_os,
        phone_make: phone_make.to_string(),
        phone_model: phone_model.to_string(),
        device_fingerprint,
        fcm_token: None,
        transaction_id: uuid::Uuid::new_v4().to_string(),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    }
}
