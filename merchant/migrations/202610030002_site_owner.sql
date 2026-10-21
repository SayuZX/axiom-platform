-- Site-owner provisioning replaces single-use merchant invitations.
-- Preserve all existing users, API keys, provider credentials and ledger rows.
DROP TABLE activation_tokens;
