#!/usr/bin/env bash
PORT=4200
TIMEOUT=20

echo "Restarting web server..."
lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
sleep 0.5
npx nx serve web > /tmp/web.log 2>&1 &

echo -n "Waiting for web on :$PORT"
for i in $(seq 1 $TIMEOUT); do
  if curl -s -o /dev/null -m 1 "http://localhost:$PORT/" 2>/dev/null; then
    echo ""
    echo "✓ Web server ready (${i}s)"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "✗ Web server did not respond within ${TIMEOUT}s — last log lines:"
tail -20 /tmp/web.log
exit 1
