-- Digital Wealth Partners — initial schema
-- Compatible with PostgreSQL 12+ (Neon) and local PostgreSQL 18.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Auth
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,          -- stored lowercase
  password_hash text NOT NULL,
  display_name  text,
  role          text NOT NULL DEFAULT 'client', -- 'client' | 'admin'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- ---------------------------------------------------------------------------
-- Client applications (the document the UI reads/writes as one unit)
--   doc      = full application document (same shape as the legacy Firestore doc)
--   columns  = queryable mirrors of the most used fields
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
  user_id            uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  uid                text NOT NULL UNIQUE,
  doc                jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             text NOT NULL DEFAULT 'pending',
  account_activated  boolean NOT NULL DEFAULT false,
  deposit_submitted  boolean NOT NULL DEFAULT false,
  full_name          text,
  email              text,
  llc_name           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_applications_status    ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created   ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_activated ON applications(account_activated);
CREATE INDEX IF NOT EXISTS idx_applications_doc_uid   ON applications ((doc->>'uid'));

-- ---------------------------------------------------------------------------
-- Client chat (admin replies from the admin dashboard)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text         text NOT NULL,
  from_        text NOT NULL DEFAULT 'admin',
  sender_email text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Deposit proof uploads (replaces Firebase Storage)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path          text NOT NULL,
  original_name text,
  mime_type     text,
  size_bytes    integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deposit_uploads_user ON deposit_uploads(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Contact form submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name  text,
  last_name   text,
  email       text,
  phone       text,
  client_type text,
  message     text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  forwarded   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Site configuration (deposit wallets, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
