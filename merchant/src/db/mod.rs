use sqlx::{mysql::MySqlPoolOptions, MySqlPool};
use std::time::Duration;

pub mod models;
pub mod queries;
pub mod encryption;

pub async fn create_pool(database_url: &str) -> Result<MySqlPool, sqlx::Error> {
    MySqlPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .after_connect(|connection, _| Box::pin(async move {
            sqlx::query("SET time_zone = '+00:00'").execute(connection).await?;
            Ok(())
        }))
        .connect(database_url)
        .await
}
