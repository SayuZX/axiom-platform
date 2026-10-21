use axum::{routing::{get, post, delete}, Router, middleware, http::{HeaderValue, Method}};
use gopaym_api::{api, config, db, polling, redis};
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "gopaym_api=info".into())).init();
    let config = config::Config::from_env().map_err(std::io::Error::other)?;
    if std::env::args().any(|a| a == "--check-config") { println!("Configuration valid"); return Ok(()); }
    let db = db::create_pool(&config.database_url).await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    let state = api::AppState {
        db,
        redis: redis::create_client(&config.redis_url).await?,
        config: config.clone(),
        user_clients: Default::default(),
        user_locks: Default::default(),
    };
    // One process owns polling/outbox; refuse duplicate workers on this database.
    let mut worker_lock = state.db.acquire().await?;
    let locked: i32 = sqlx::query_scalar("SELECT GET_LOCK('axiom_merchant_worker',0)").fetch_one(&mut *worker_lock).await?;
    if locked != 1 { return Err("Another merchant worker holds the database lock".into()); }
    polling::start_polling_task(state.clone());
    let protected = Router::new()
        .route("/api/auth/me",get(api::auth::me))
        .route("/api/auth/login-methods",post(api::auth::login_methods))
        .route("/api/auth/otp-initiate",post(api::auth::otp_initiate))
        .route("/api/auth/otp-verify",post(api::auth::otp_verify))
        .route("/api/auth/account-list",post(api::auth::get_account_list))
        .route("/api/auth/exchange-1fa",post(api::auth::exchange_1fa_to_2fa))
        .route("/api/auth/initiate-2fa-otp",post(api::auth::initiate_2fa_otp))
        .route("/api/auth/verify-2fa-otp",post(api::auth::verify_2fa_otp))
        .route("/api/auth/exchange-2fa",post(api::auth::exchange_2fa_to_full_access))
        .route("/api/payment/generate-qris",post(api::payment::generate_qris))
        .route("/api/payment/status/:order_id",get(api::payment::get_status))
        .route("/api/payment/cancel/:order_id",post(api::payment::cancel))
        .route("/api/payment/list",get(api::payment::list))
        .route("/api/wallet/history",get(api::payment::list))
        .route("/api/wallet/balance",get(api::wallet::get_balance))
        .route("/api/wallet/summary",get(api::wallet::get_summary))
        .route("/api/balance/home",get(api::merchant::get_balance_home))
        .route("/api/balance/multi-wallet",get(api::merchant::get_balance_multi_wallet))
        .route("/api/wallets/balance",get(api::merchant::get_wallets_balance_v2))
        .route("/api/merchant/user-config",get(api::merchant::get_user_config))
        .route("/api/merchant/qris-pops",get(api::merchant::get_qris_pops))
        .route("/api/profile",get(api::merchant::get_profile))
        .route("/api/users",get(api::users::list_users).post(api::users::add_user))
        .route("/api/users/search",post(api::users::search_users))
        .route("/api/users/:user_id",get(api::users::get_user).patch(api::users::update_user).delete(api::users::delete_user))
        .route("/api/users/:user_id/permissions",axum::routing::patch(api::users::update_permissions))
        .route("/api/webhook/register",post(api::webhook::register))
        .route("/api/webhook/list",get(api::webhook::list))
        .route("/api/webhook/:id",delete(api::webhook::delete))
        .layer(middleware::from_fn_with_state(state.clone(),gopaym_api::middleware::auth::validate_api_key));
    let app = Router::new().route("/health",get(|| async { "OK" }))
        .route("/api/auth/owner",post(api::auth::owner)).merge(protected).with_state(state)
        .layer(CorsLayer::new().allow_origin(HeaderValue::from_static("https://ai.axiomcreative.xyz"))
            .allow_methods([Method::GET,Method::POST,Method::PATCH,Method::DELETE])
            .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::HeaderName::from_static("x-api-key")]))
        .layer(axum::extract::DefaultBodyLimit::max(64*1024));
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, config.port)).await?;
    tracing::info!(port=config.port,"Merchant service listening on loopback");
    axum::serve(listener,app).await?;
    drop(worker_lock);
    Ok(())
}
