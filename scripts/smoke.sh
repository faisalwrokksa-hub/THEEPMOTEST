#!/usr/bin/env bash
# pnpm smoke — is the whole stack actually working right now?
set -uo pipefail
ok(){ printf "  \033[32m✓\033[0m %s\n" "$1"; }
bad(){ printf "  \033[31m✗\033[0m %s\n" "$1"; FAIL=1; }
FAIL=0
echo "Checking The EPMO locally…"
docker ps --format '{{.Names}}' | grep -qx pmo-postgres && ok "postgres  :5433" || bad "postgres not running — pnpm infra:up"
docker ps --format '{{.Names}}' | grep -qx pmo-redis    && ok "redis     :6380" || bad "redis not running — pnpm infra:up"
curl -sf -m 3 http://localhost:4000/health >/dev/null && ok "api       :4000" || bad "api down — pnpm dev"
curl -sf -m 8 http://localhost:3000/ >/dev/null       && ok "web       :3000" || bad "web down — pnpm dev"
T=$(docker exec pmo-postgres psql -U postgres -d pmo -tAc "select id from tenants where slug='al-nakheel'" 2>/dev/null | tr -d '[:space:]')
U=$(docker exec pmo-postgres psql -U postgres -d pmo -tAc "select id from users where email='fatima@al-nakheel.test'" 2>/dev/null | tr -d '[:space:]')
if [ -n "$T" ]; then
  N=$(curl -sf -m 5 -H "x-tenant-id: $T" -H "x-user-id: $U" http://localhost:4000/api/v1/projects \
      | python3 -c "import json,sys;print(len(json.load(sys.stdin)['items']))" 2>/dev/null)
  [ "${N:-0}" -gt 0 ] && ok "api returns $N projects for Al-Nakheel" || bad "api returned no projects — pnpm db:seed"
  grep -q "$T" apps/web/.env.local 2>/dev/null && ok "web .env.local matches the database" \
    || bad "apps/web/.env.local is stale — run pnpm db:seed, then restart pnpm dev"
else
  bad "no seed data — pnpm db:seed"
fi
echo
[ "$FAIL" = 0 ] && echo "All good. Open http://localhost:3000/projects" || echo "Fix the ✗ items above."
exit $FAIL
