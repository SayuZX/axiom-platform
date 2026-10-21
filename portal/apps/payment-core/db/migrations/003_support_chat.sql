CREATE TABLE IF NOT EXISTS support_reads(
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  viewer_id TEXT NOT NULL REFERENCES customers(id),
  message_id INTEGER NOT NULL REFERENCES support_messages(id) CHECK(message_id>0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(ticket_id,viewer_id)
);
CREATE TABLE IF NOT EXISTS support_requests(
  actor_id TEXT NOT NULL REFERENCES customers(id),
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  message_id INTEGER NOT NULL REFERENCES support_messages(id),
  PRIMARY KEY(actor_id,request_id)
);
CREATE INDEX IF NOT EXISTS support_customer_updated ON support_tickets(customer_id,updated_at,id);
CREATE INDEX IF NOT EXISTS support_public_messages ON support_messages(ticket_id,internal,id);
