#!/usr/bin/env bash
API_PORT=3000
WEB_PORT=4200
API_TIMEOUT=30
WEB_TIMEOUT=20

echo "Restarting both servers..."
lsof -ti :$API_PORT | xargs kill -9 2>/dev/null || true
lsof -ti :$WEB_PORT | xargs kill -9 2>/dev/null || true
sleep 0.5
npx nx serve api > /tmp/api.log 2>&1 &
npx nx serve web > /tmp/web.log 2>&1 &

STATUS=0

echo -n "Waiting for API on :$API_PORT"
for i in $(seq 1 $API_TIMEOUT); do
  if curl -s -o /dev/null -m 1 "http://localhost:$API_PORT/" 2>/dev/null; then
    echo ""
    echo "✓ API server ready (${i}s)"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq "$API_TIMEOUT" ]; then
    echo ""
    echo "✗ API server did not respond within ${API_TIMEOUT}s — last log lines:"
    tail -20 /tmp/api.log
    STATUS=1
  fi
done

echo -n "Waiting for web on :$WEB_PORT"
for i in $(seq 1 $WEB_TIMEOUT); do
  if curl -s -o /dev/null -m 1 "http://localhost:$WEB_PORT/" 2>/dev/null; then
    echo ""
    echo "✓ Web server ready (${i}s)"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq "$WEB_TIMEOUT" ]; then
    echo ""
    echo "✗ Web server did not respond within ${WEB_TIMEOUT}s — last log lines:"
    tail -20 /tmp/web.log
    STATUS=1
  fi
done

exit $STATUS
