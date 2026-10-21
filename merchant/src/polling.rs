use crate::{api::{AppState, payment, webhook}, error::Result};
use sqlx::Row;

pub fn start_polling_task(state: AppState) {
    tokio::spawn(async move {
        let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(15)).build().expect("Webhook HTTP configuration");
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            if poll(&state).await.is_err() { tracing::warn!("Payment polling failed; retained for next cycle"); }
            if webhook::deliver(&state,&client).await.is_err() { tracing::warn!("Webhook delivery failed; retained in outbox"); }
        }
    });
}
async fn poll(state: &AppState) -> Result<()> {
    // Recheck recent terminal cancellations/expiry to capture settlement races.
    let rows = sqlx::query("SELECT order_id,user_id FROM payment_orders WHERE status='pending' OR (status IN ('cancel','expire','deny','failure') AND created_at > DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)) ORDER BY COALESCE(last_checked_at,created_at) LIMIT 100")
        .fetch_all(&state.db).await?;
    for row in rows {
        let user: String = row.try_get("user_id")?;
        let id: String = row.try_get("order_id")?;
        let lock = state.user_lock(&user).await;
        let _guard = lock.lock().await;
        // Fair rotation even when provider rejects/does not know an ambiguous charge.
        sqlx::query("UPDATE payment_orders SET last_checked_at=UTC_TIMESTAMP() WHERE order_id=?").bind(&id).execute(&state.db).await?;
        if payment::reconcile(state,&user,&id).await.is_err() { tracing::warn!("Provider order could not be verified; no state or credit inferred"); }
    }
    Ok(())
}
