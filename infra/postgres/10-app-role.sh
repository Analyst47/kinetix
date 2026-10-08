#!/bin/sh
# Runs once, when the Postgres volume is first initialized. Creates the restricted role the
# API and worker connect as. It owns nothing, so row-level security always applies to it.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v db="$POSTGRES_DB" -v role="${KINETIX_DB_APP_ROLE:-kinetix_app}" -v pw="${KINETIX_DB_APP_PASSWORD:?}" <<'SQL'
CREATE ROLE :"role" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'pw';
GRANT CONNECT ON DATABASE :"db" TO :"role";
SQL
