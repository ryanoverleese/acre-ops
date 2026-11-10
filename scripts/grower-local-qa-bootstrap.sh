#!/usr/bin/env bash
# Ephemeral local Postgres for grower pilot QA. Does not touch production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OWNER_PASS="${ACRE_LOCAL_OWNER_PASS:-local_owner_qa_only}"
GROWER_PASS="${ACRE_LOCAL_GROWER_PASS:-local_grower_qa_only}"

sudo service postgresql start >/dev/null 2>&1 || true

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acre_ops_owner') THEN
    CREATE ROLE acre_ops_owner LOGIN PASSWORD '${OWNER_PASS}' SUPERUSER;
  ELSE
    ALTER ROLE acre_ops_owner WITH LOGIN PASSWORD '${OWNER_PASS}' SUPERUSER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acre_grower') THEN
    CREATE ROLE acre_grower NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN PASSWORD '${GROWER_PASS}';
  ELSE
    ALTER ROLE acre_grower WITH LOGIN PASSWORD '${GROWER_PASS}';
  END IF;
END
\$\$;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT ALL ON SCHEMA public TO acre_ops_owner;
GRANT ALL ON SCHEMA public TO postgres;
GRANT acre_grower TO acre_ops_owner;
SQL

export PGPASSWORD="$OWNER_PASS"
for f in $(ls "$ROOT/supabase/migrations/"*.sql | sort); do
  echo "Applying $(basename "$f")"
  psql -h 127.0.0.1 -U acre_ops_owner -d postgres -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

cat > /tmp/grower-local-qa.env <<EOF
ACRE_LOCAL_PG=1
NODE_ENV=development
AUTH_SECRET=local-grower-qa-auth-secret-not-for-prod
SUPABASE_URL=https://junawlttpyztjlnbmvcb.supabase.co
DATABASE_URL=postgresql://acre_ops_owner:${OWNER_PASS}@127.0.0.1:5432/postgres?sslmode=disable
DATABASE_URL_GROWER=postgresql://acre_grower:${GROWER_PASS}@127.0.0.1:5432/postgres?sslmode=disable
GROWER_PILOT_FARM_NAMES="QA Pilot Farm"
GROWER_ALLOW_OWNER_FALLBACK=0
PORT=3010
EOF
chmod 600 /tmp/grower-local-qa.env

set -a
# shellcheck disable=SC1091
source /tmp/grower-local-qa.env
set +a
cd "$ROOT"
node scripts/grower-local-qa-seed.mjs

echo "Bootstrap complete. Env: /tmp/grower-local-qa.env"
echo "Login artifact: /opt/cursor/artifacts/GROWER_PILOT_TEST_LOGIN.txt"
