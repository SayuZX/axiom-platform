// Redis client module
use redis::{aio::ConnectionManager, Client};

pub async fn create_client(redis_url: &str) -> Result<ConnectionManager, redis::RedisError> {
    let client = Client::open(redis_url)?;
    let manager = ConnectionManager::new(client).await?;
    Ok(manager)
}

// Rate limiting helper
pub async fn check_rate_limit(
    conn: &mut ConnectionManager,
    key: &str,
    limit: u32,
    window_secs: u64,
) -> Result<bool, redis::RedisError> {
    use redis::AsyncCommands;

    let count: u32 = conn.incr(key, 1).await?;
    
    if count == 1 {
        let _: () = conn.expire(key, window_secs as i64).await?;
    }

    Ok(count <= limit)
}
