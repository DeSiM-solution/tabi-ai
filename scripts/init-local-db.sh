#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${LOCAL_DB_CONTAINER_NAME:-ai-next-local-postgres}"
DB_NAME="${LOCAL_DB_NAME:-ai_next}"
DB_USER="${LOCAL_DB_USER:-postgres}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "[local-db] Container '$CONTAINER_NAME' is not running. Start it with: npm run db:local:up"
  exit 1
fi

run_sql_file() {
  local sql_file="$1"
  echo "[local-db] Applying $sql_file"
  docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$sql_file"
}

session_table_exists="$(
  docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "select to_regclass('public.\"Session\"') is not null"
)"

utm_table_exists="$(
  docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
    "select to_regclass('public.\"UtmTracking\"') is not null"
)"

if [[ "$session_table_exists" != "t" ]]; then
  run_sql_file "prisma/migrations/20260304_init_full_schema.sql"
else
  echo "[local-db] Session table already exists. Skipping base schema bootstrap."
fi

if [[ "$utm_table_exists" != "t" ]]; then
  run_sql_file "prisma/migrations/20260310_add_utm_tracking.sql"
else
  echo "[local-db] UtmTracking table already exists. Skipping UTM bootstrap."
fi

echo "[local-db] Local database is ready."
