-- ============================================================
-- Zap-Conecta — Migration 002: Seed dos Planos
-- ============================================================

INSERT INTO plans (name, display_name, price_brl_cents, messages_per_month, instances_limit, api_keys_limit, features)
VALUES
  (
    'free',
    'Free',
    0,
    300,
    1,
    2,
    '{"support": "community", "webhooks": false, "message_history_days": 7}'::jsonb
  ),
  (
    'starter',
    'Starter',
    9700,
    5000,
    3,
    5,
    '{"support": "email", "webhooks": true, "message_history_days": 30}'::jsonb
  ),
  (
    'pro',
    'Pro',
    29700,
    30000,
    10,
    -1,
    '{"support": "priority", "webhooks": true, "message_history_days": 90, "analytics": true}'::jsonb
  ),
  (
    'enterprise',
    'Enterprise',
    0,
    -1,
    -1,
    -1,
    '{"support": "dedicated", "webhooks": true, "message_history_days": -1, "analytics": true, "sla": true, "custom_integrations": true}'::jsonb
  );
