#!/bin/sh
# Usage: PGHOST=... PGPORT=... PGUSER=postgres sh supabase/tests/run.sh   (needs a scratch database; it is dropped and recreated)
set -e
cd "$(dirname "$0")/../.."
P="psql -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists isl_test" -c "create database isl_test"
P="$P -d isl_test"
$P -f supabase/tests/00_stubs.sql
$P -f supabase/migrations/0001_schema.sql
$P -f supabase/seed.sql
$P -f supabase/tests/10_policies_test.sql
