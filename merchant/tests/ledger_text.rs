// Rust, tests/ledger_text.rs, MariaDB 13: real schema text decoding regression.
use sqlx::{mysql::MySqlPoolOptions, Row};
#[tokio::test]
#[ignore = "requires TEST_DATABASE_URL with permission to create temporary tables"]
async fn case_sensitive_ledger_identifiers_decode_as_text() -> Result<(), Box<dyn std::error::Error>> {
    let pool=MySqlPoolOptions::new().max_connections(1).connect(&std::env::var("TEST_DATABASE_URL")?).await?;
    let mut connection=pool.acquire().await?;
    sqlx::query("CREATE TEMPORARY TABLE payment_orders(order_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY)").execute(&mut *connection).await?;
    sqlx::query("CREATE TEMPORARY TABLE webhooks(url VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE)").execute(&mut *connection).await?;
    sqlx::query("CREATE TEMPORARY TABLE webhook_outbox(event_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE)").execute(&mut *connection).await?;
    sqlx::query("CREATE TEMPORARY TABLE api_keys(key_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE)").execute(&mut *connection).await?;
    sqlx::query("INSERT INTO payment_orders VALUES('Invoice-A'),('invoice-a')").execute(&mut *connection).await?;
    sqlx::raw_sql(include_str!("../migrations/202610030003_text_identifiers.sql")).execute(&mut *connection).await?;
    let rows=sqlx::query("SELECT order_id FROM payment_orders").fetch_all(&mut *connection).await?;
    let ids:Vec<String>=rows.iter().map(|r|r.try_get("order_id")).collect::<Result<_,_>>()?;
    assert!(ids.contains(&"Invoice-A".to_owned()));assert!(ids.contains(&"invoice-a".to_owned()));
    sqlx::query("INSERT INTO webhooks VALUES('https://ai.axiomcreative.xyz/merchant-api/webhook')").execute(&mut *connection).await?;
    let url:String=sqlx::query_scalar("SELECT url FROM webhooks").fetch_one(&mut *connection).await?;
    assert_eq!(url,"https://ai.axiomcreative.xyz/merchant-api/webhook");
    sqlx::query("INSERT INTO webhook_outbox VALUES('qris:Invoice-A:settlement')").execute(&mut *connection).await?;
    let event:String=sqlx::query_scalar("SELECT event_id FROM webhook_outbox").fetch_one(&mut *connection).await?;
    assert_eq!(event,"qris:Invoice-A:settlement");
    for table in ["payment_orders","webhooks","webhook_outbox","api_keys"] {sqlx::query(&format!("DROP TEMPORARY TABLE {table}")).execute(&mut *connection).await?;}
    drop(connection);pool.close().await;Ok(())
}
