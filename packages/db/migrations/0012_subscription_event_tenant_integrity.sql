-- Enforce subscription event -> subscription ownership at the database layer.
-- Review existing data first: the migration intentionally fails if cross-tenant
-- references exist, rather than silently rewriting audit history.
DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM subscription_events e
  JOIN tenant_subscriptions s ON s.id = e.subscription_id
  WHERE e.tenant_id <> s.tenant_id
 ) THEN
  RAISE EXCEPTION 'Cross-tenant subscription audit events exist; reconcile before migration';
 END IF;
END $$;
ALTER TABLE tenant_subscriptions
 ADD CONSTRAINT tenant_subscriptions_tenant_id_id_unique UNIQUE (tenant_id, id);
ALTER TABLE subscription_events
 ADD CONSTRAINT subscription_events_same_tenant_subscription_fk
 FOREIGN KEY (tenant_id, subscription_id)
 REFERENCES tenant_subscriptions (tenant_id, id);
