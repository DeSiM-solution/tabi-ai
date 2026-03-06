#!/usr/bin/env bash
set -euo pipefail

# Full backfill: Neon (source) -> Supabase dev (target).
# Default URLs are inferred from .env.local, but can be overridden by env vars:
# - NEON_SOURCE_URL
# - SUPABASE_DEV_TARGET_URL

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

NEON_SOURCE_URL="${NEON_SOURCE_URL:-${DATABASE_URL_POSTGRES_URL_NON_POOLING:-}}"
SUPABASE_DEV_TARGET_URL="${SUPABASE_DEV_TARGET_URL:-${DATABASE_URL:-}}"
SUPABASE_DEV_TARGET_URL="${SUPABASE_DEV_TARGET_URL//&uselibpqcompat=true/}"

if [[ -z "$NEON_SOURCE_URL" ]]; then
  echo "[backfill] Missing source URL: set NEON_SOURCE_URL or DATABASE_URL_POSTGRES_URL_NON_POOLING"
  exit 1
fi

if [[ -z "$SUPABASE_DEV_TARGET_URL" ]]; then
  echo "[backfill] Missing target URL: set SUPABASE_DEV_TARGET_URL or DATABASE_URL"
  exit 1
fi

PG_DUMP_BIN="$(command -v pg_dump || true)"
PSQL_BIN="$(command -v psql || true)"

if [[ -z "$PG_DUMP_BIN" && -x "/opt/homebrew/opt/libpq/bin/pg_dump" ]]; then
  PG_DUMP_BIN="/opt/homebrew/opt/libpq/bin/pg_dump"
fi
if [[ -z "$PSQL_BIN" && -x "/opt/homebrew/opt/libpq/bin/psql" ]]; then
  PSQL_BIN="/opt/homebrew/opt/libpq/bin/psql"
fi

if [[ -z "$PG_DUMP_BIN" ]]; then
  echo "[backfill] pg_dump not found. Install libpq first."
  exit 1
fi
if [[ -z "$PSQL_BIN" ]]; then
  echo "[backfill] psql not found. Install libpq first."
  exit 1
fi

DUMP_FILE="/tmp/tabi_neon_full_public.sql"
SOURCE_COUNTS_SQL="/tmp/tabi_neon_counts.sql"
TARGET_COUNTS_SQL="/tmp/tabi_supabase_dev_counts.sql"
SOURCE_COUNTS_OUT="/tmp/tabi_neon_counts.out"
TARGET_COUNTS_OUT="/tmp/tabi_supabase_dev_counts.out"

cat > "$SOURCE_COUNTS_SQL" <<'SQL'
select 'User' as table_name, count(*)::bigint as rows from "User"
union all select 'Session', count(*)::bigint from "Session"
union all select 'Handbook', count(*)::bigint from "Handbook"
union all select 'SessionState', count(*)::bigint from "SessionState"
union all select 'ChatMessage', count(*)::bigint from "ChatMessage"
union all select 'SessionStep', count(*)::bigint from "SessionStep"
order by table_name;
SQL
cp "$SOURCE_COUNTS_SQL" "$TARGET_COUNTS_SQL"

echo "[backfill] Step 1/5: source connectivity check (Neon)"
"$PSQL_BIN" "$NEON_SOURCE_URL" -v ON_ERROR_STOP=1 -c "select current_database() as db, current_user as usr;"

echo "[backfill] Step 2/5: target connectivity check (Supabase dev)"
"$PSQL_BIN" "$SUPABASE_DEV_TARGET_URL" -v ON_ERROR_STOP=1 -c "select current_database() as db, current_user as usr;"

echo "[backfill] Step 3/5: export Neon public schema+data -> $DUMP_FILE"
"$PG_DUMP_BIN" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --schema=public \
  "$NEON_SOURCE_URL" > "$DUMP_FILE"

echo "[backfill] Step 4/5: import dump into Supabase dev"
"$PSQL_BIN" "$SUPABASE_DEV_TARGET_URL" -v ON_ERROR_STOP=1 -f "$DUMP_FILE"

echo "[backfill] Step 5/5: reconcile key table counts"
"$PSQL_BIN" "$NEON_SOURCE_URL" -v ON_ERROR_STOP=1 -f "$SOURCE_COUNTS_SQL" > "$SOURCE_COUNTS_OUT"
"$PSQL_BIN" "$SUPABASE_DEV_TARGET_URL" -v ON_ERROR_STOP=1 -f "$TARGET_COUNTS_SQL" > "$TARGET_COUNTS_OUT"

echo "[backfill] Source (Neon) counts:"
cat "$SOURCE_COUNTS_OUT"
echo
echo "[backfill] Target (Supabase dev) counts:"
cat "$TARGET_COUNTS_OUT"

if diff -u "$SOURCE_COUNTS_OUT" "$TARGET_COUNTS_OUT" >/tmp/tabi_backfill_counts.diff; then
  echo
  echo "[backfill] SUCCESS: key table counts match."
else
  echo
  echo "[backfill] WARNING: key table counts differ."
  echo "[backfill] See /tmp/tabi_backfill_counts.diff"
  exit 2
fi
