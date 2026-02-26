-- ============================================================
-- Zap-Conecta — Migration 001: Schema Inicial SaaS
-- ============================================================
-- Ordem de criação (respeitar FKs):
--   1. plans
--   2. tenants
--   3. profiles (references auth.users)
--   4. api_keys
--   5. whatsapp_instances
--   6. messages
--   7. subscriptions
--   8. usage_records
--   9. webhooks
-- ============================================================

-- ─── Extensões ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ────────────────────────────────────────────────────
CREATE TYPE tenant_status AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');
CREATE TYPE profile_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE instance_status AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR');
CREATE TYPE message_direction AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE message_type AS ENUM ('TEXT','IMAGE','DOCUMENT','AUDIO','VIDEO','STICKER','LOCATION','CONTACT','BUTTON','LIST','PIX','TEMPLATE');
CREATE TYPE message_status AS ENUM ('PENDING','SENT','DELIVERED','READ','FAILED');
CREATE TYPE subscription_status AS ENUM ('TRIALING','ACTIVE','PAST_DUE','CANCELLED','PAUSED');

-- ─── 1. Plans ─────────────────────────────────────────────────
CREATE TABLE plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT UNIQUE NOT NULL,
  display_name       TEXT NOT NULL,
  price_brl_cents    INT NOT NULL DEFAULT 0,
  messages_per_month INT NOT NULL DEFAULT 300,
  instances_limit    INT NOT NULL DEFAULT 1,
  api_keys_limit     INT NOT NULL DEFAULT 2,
  features           JSONB NOT NULL DEFAULT '{}',
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Tenants ───────────────────────────────────────────────
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  plan_id    UUID NOT NULL REFERENCES plans(id),
  status     tenant_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- ─── 3. Profiles ──────────────────────────────────────────────
-- id = auth.users.id do Supabase (1:1)
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        profile_role NOT NULL DEFAULT 'OWNER',
  full_name   TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_tenant_id ON profiles(tenant_id);

-- ─── 4. API Keys ──────────────────────────────────────────────
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_id UUID NOT NULL REFERENCES profiles(id),
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL,     -- SHA-256 do valor real
  key_prefix    TEXT NOT NULL,     -- "zc_live_abc123..." (16 chars, para UI)
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix); -- busca rápida na validação

-- ─── 5. WhatsApp Instances ────────────────────────────────────
CREATE TABLE whatsapp_instances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenant_slug    TEXT UNIQUE NOT NULL, -- compatibilidade Evolution API
  instance_name  TEXT UNIQUE NOT NULL,
  instance_token TEXT,
  status         instance_status NOT NULL DEFAULT 'DISCONNECTED',
  phone          TEXT,               -- número após conexão
  webhook_url    TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_instances_tenant_id ON whatsapp_instances(tenant_id);

-- ─── 6. Messages ──────────────────────────────────────────────
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  direction   message_direction NOT NULL,
  type        message_type NOT NULL,
  content     JSONB NOT NULL,
  status      message_status NOT NULL DEFAULT 'PENDING',
  external_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_tenant_phone ON messages(tenant_id, phone);
CREATE INDEX idx_messages_tenant_created ON messages(tenant_id, created_at DESC);
CREATE INDEX idx_messages_instance_id ON messages(instance_id);

-- ─── 7. Subscriptions ────────────────────────────────────────
CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id               UUID NOT NULL REFERENCES plans(id),
  asaas_subscription_id TEXT,
  asaas_customer_id     TEXT,
  status                subscription_status NOT NULL DEFAULT 'TRIALING',
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  trial_ends_at         TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 8. Usage Records ────────────────────────────────────────
CREATE TABLE usage_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period            TEXT NOT NULL, -- 'YYYY-MM'
  messages_sent     INT NOT NULL DEFAULT 0,
  messages_received INT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_usage_tenant_period UNIQUE (tenant_id, period)
);

CREATE INDEX idx_usage_records_tenant_id ON usage_records(tenant_id);

-- ─── 9. Webhooks ─────────────────────────────────────────────
CREATE TABLE webhooks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  events     TEXT[] NOT NULL,
  secret     TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_tenant_id ON webhooks(tenant_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
-- Estratégia: profiles.tenant_id determina o contexto do usuário.
-- Todas as tabelas usam auth.uid() → profiles → tenant_id.
-- ============================================================

-- Helper function: retorna tenant_id do usuário logado
CREATE OR REPLACE FUNCTION get_user_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$;

-- Helper function: retorna role do usuário logado
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS profile_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- ─── RLS: tenants ─────────────────────────────────────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_select_own" ON tenants
  FOR SELECT USING (id = get_user_tenant_id());

CREATE POLICY "tenants_update_own_admin" ON tenants
  FOR UPDATE USING (
    id = get_user_tenant_id()
    AND get_user_role() IN ('OWNER', 'ADMIN')
  );

-- ─── RLS: profiles ────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own_tenant" ON profiles
  FOR SELECT USING (tenant_id = get_user_tenant_id());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- ─── RLS: api_keys ────────────────────────────────────────────
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_tenant_isolation" ON api_keys
  FOR ALL USING (tenant_id = get_user_tenant_id());

-- ─── RLS: whatsapp_instances ──────────────────────────────────
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instances_tenant_isolation" ON whatsapp_instances
  FOR ALL USING (tenant_id = get_user_tenant_id());

-- ─── RLS: messages ────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_tenant_isolation" ON messages
  FOR ALL USING (tenant_id = get_user_tenant_id());

-- ─── RLS: subscriptions ───────────────────────────────────────
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_tenant_isolation" ON subscriptions
  FOR SELECT USING (tenant_id = get_user_tenant_id());

-- ─── RLS: usage_records ──────────────────────────────────────
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usage_records_tenant_isolation" ON usage_records
  FOR SELECT USING (tenant_id = get_user_tenant_id());

-- ─── RLS: webhooks ────────────────────────────────────────────
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhooks_tenant_isolation" ON webhooks
  FOR ALL USING (tenant_id = get_user_tenant_id());

-- ─── RLS: plans (público para leitura) ───────────────────────
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_select_public" ON plans
  FOR SELECT USING (is_active = true);

-- ============================================================
-- Triggers: updated_at automático
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER whatsapp_instances_updated_at
  BEFORE UPDATE ON whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Trigger: criar profile automaticamente após signup Supabase
-- ============================================================

-- NOTA: Este trigger é chamado quando um novo usuário é criado
-- no Supabase Auth. O tenant_id é passado via raw_user_meta_data.
-- O signup via API cria o tenant primeiro, depois o usuário.
-- Este trigger apenas cria o profile vinculando user ↔ tenant.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só cria profile se tenant_id foi passado nos metadados
  IF NEW.raw_user_meta_data ->> 'tenant_id' IS NOT NULL THEN
    INSERT INTO profiles (id, tenant_id, role, full_name)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data ->> 'tenant_id')::UUID,
      COALESCE((NEW.raw_user_meta_data ->> 'role')::profile_role, 'OWNER'),
      NEW.raw_user_meta_data ->> 'full_name'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
