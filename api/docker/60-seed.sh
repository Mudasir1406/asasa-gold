#!/bin/sh
# Idempotent: DatabaseSeeder only posts the SEED batch when no SEED entries exist.
set -e
echo "[60-seed] ensuring opening balances"
php /var/www/html/artisan app:ensure-seeded --no-interaction || echo "[60-seed] seed skipped"
