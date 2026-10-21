CREATE TABLE IF NOT EXISTS telegram_menus(chat_id TEXT PRIMARY KEY,revision INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS telegram_delivery_menu ON telegram_deliveries(chat_id,menu_revision,state) WHERE menu_revision IS NOT NULL;
