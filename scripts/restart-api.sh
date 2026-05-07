#!/usr/bin/env bash
PORT=3000
TIMEOUT=30

echo "Restarting API server..."
lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
sleep 0.5
npx nx serve api > /tmp/api.log 2>&1 &

echo -n "Waiting for API on :$PORT"
for i in $(seq 1 $TIMEOUT); do
  if curl -s -o /dev/null -m 1 "http://localhost:$PORT/" 2>/dev/null; then
    echo ""
    echo "✓ API server ready (${i}s)"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "✗ API server did not respond within ${TIMEOUT}s — last log lines:"
tail -20 /tmp/api.log
exit 1
