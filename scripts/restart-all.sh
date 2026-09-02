#!/usr/bin/env bash
API_PORT=3000
PROCESSOR_PORT=3001
WEB_PORT=4200
R2_GATEWAY_PORT=8787
API_TIMEOUT=30
PROCESSOR_TIMEOUT=30
WEB_TIMEOUT=20
R2_GATEWAY_TIMEOUT=30

echo "Restarting all servers from: $(pwd)"

# In a worktree node_modules won't exist — create symlink to main repo's copy
if [ ! -e node_modules ]; then
  MAIN_REPO=$(git worktree list 2>/dev/null | head -1 | awk '{print $1}')
  if [ -n "$MAIN_REPO" ] && [ -d "$MAIN_REPO/node_modules" ]; then
    ln -sfn "$MAIN_REPO/node_modules" node_modules
    echo "✓ node_modules → $MAIN_REPO/node_modules"
  else
    echo "✗ node_modules not found — run 'pnpm install' first"
    exit 1
  fi
fi

lsof -ti :$API_PORT | xargs kill -9 2>/dev/null || true
lsof -ti :$PROCESSOR_PORT | xargs kill -9 2>/dev/null || true
lsof -ti :$WEB_PORT | xargs kill -9 2>/dev/null || true
# wrangler dev also spawns a `workerd` control process bound to an ephemeral
# port (not $R2_GATEWAY_PORT), so a port-only kill can leave it running and
# collide with the next run ("Address already in use"). Match it by this
# worktree's own node_modules path (resolved through the symlink) instead.
NODE_MODULES_REAL=$(cd node_modules 2>/dev/null && pwd -P)
if [ -n "$NODE_MODULES_REAL" ]; then
  pkill -f "$NODE_MODULES_REAL/.pnpm.*workerd" 2>/dev/null || true
fi
lsof -ti :$R2_GATEWAY_PORT | xargs kill -9 2>/dev/null || true
sleep 0.5
npx nx serve api > /tmp/api.log 2>&1 &
npx nx serve event-processor > /tmp/event-processor.log 2>&1 &
npx nx serve web > /tmp/web.log 2>&1 &
(cd apps/r2-dev-gateway && npx wrangler dev --port $R2_GATEWAY_PORT) > /tmp/r2-dev-gateway.log 2>&1 &

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

echo -n "Waiting for event-processor on :$PROCESSOR_PORT"
for i in $(seq 1 $PROCESSOR_TIMEOUT); do
  if curl -s -o /dev/null -m 1 "http://localhost:$PROCESSOR_PORT/" 2>/dev/null; then
    echo ""
    echo "✓ event-processor ready (${i}s)"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq "$PROCESSOR_TIMEOUT" ]; then
    echo ""
    echo "✗ event-processor did not respond within ${PROCESSOR_TIMEOUT}s — last log lines:"
    tail -20 /tmp/event-processor.log
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

echo -n "Waiting for r2-dev-gateway on :$R2_GATEWAY_PORT"
for i in $(seq 1 $R2_GATEWAY_TIMEOUT); do
  if curl -s -o /dev/null -m 1 "http://localhost:$R2_GATEWAY_PORT/health" 2>/dev/null; then
    echo ""
    echo "✓ r2-dev-gateway ready (${i}s)"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq "$R2_GATEWAY_TIMEOUT" ]; then
    echo ""
    echo "✗ r2-dev-gateway did not respond within ${R2_GATEWAY_TIMEOUT}s — last log lines:"
    tail -20 /tmp/r2-dev-gateway.log
    STATUS=1
  fi
done

exit $STATUS
