#!/usr/bin/env bash
# Fires N confirms at ONE quote simultaneously and asserts exactly one trade exists.
# Usage: scripts/double-confirm.sh [base-url] [parallelism]
#   scripts/double-confirm.sh http://localhost:8000
#   scripts/double-confirm.sh https://your-api.up.railway.app 20
set -euo pipefail
H="${1:-http://localhost:8000}"
N="${2:-10}"
jqp() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

echo "→ $H"
curl -sS -X POST "$H/api/demo/balances" -H 'Content-Type: application/json' \
     -d '{"customer_cash_paisa":25000000}' >/dev/null

Q=$(curl -sS -X POST "$H/api/quotes" -H 'Content-Type: application/json' \
        -d '{"side":"BUY","input_mode":"GOLD","amount":100}' | jqp 'd["id"]')
echo "quote $Q"

BEFORE=$(curl -sS "$H/api/integrity" | jqp 'd["entry_count"]')

printf 'statuses: '
for _ in $(seq 1 "$N"); do
  curl -sS -o /dev/null -w '%{http_code} ' -X POST "$H/api/quotes/$Q/confirm" &
done
wait
echo

AFTER=$(curl -sS "$H/api/integrity" | jqp 'd["entry_count"]')
OK=$(curl -sS "$H/api/integrity" | jqp 'd["ok"]')
FOR_QUOTE=$(curl -sS "$H/api/trades" | jqp "sum(1 for t in d if t['quote_id']=='$Q')")

echo "trades for this quote : $FOR_QUOTE   (expected 1)"
echo "ledger entries        : $BEFORE → $AFTER   (expected +4)"
echo "integrity ok          : $OK"

[ "$FOR_QUOTE" = "1" ] && [ "$((AFTER-BEFORE))" = "4" ] && [ "$OK" = "True" ] \
  && { echo "PASS — $N concurrent confirms produced exactly one trade"; exit 0; } \
  || { echo "FAIL"; exit 1; }
