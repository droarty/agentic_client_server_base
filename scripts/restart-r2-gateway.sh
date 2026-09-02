#!/usr/bin/env bash
PORT=8787
TIMEOUT=30

echo "Restarting r2-dev-gateway from: $(pwd)"

# wrangler 4.x refuses to run below Node 22 — fail with a clear message
# instead of a cryptic wrangler crash. This only affects this dev-only
# gateway; the rest of the repo still targets whatever Node version it uses.
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "✗ r2-dev-gateway needs Node >=22 to run wrangler (found $(node --version))."
  echo "  Switch with nvm/volta, e.g.: nvm install 22 && nvm use 22"
  exit 1
fi

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

# wrangler dev also spawns a `workerd` control process bound to an ephemeral
# port (not $PORT), so a port-only kill can leave it running and collide with
# the next run ("Address already in use"). Match it by this worktree's own
# node_modules path (resolved through the symlink) instead.
NODE_MODULES_REAL=$(cd node_modules 2>/dev/null && pwd -P)
if [ -n "$NODE_MODULES_REAL" ]; then
  pkill -f "$NODE_MODULES_REAL/.pnpm.*workerd" 2>/dev/null || true
fi
lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
sleep 0.5
(cd apps/r2-dev-gateway && npx wrangler dev --port $PORT) > /tmp/r2-dev-gateway.log 2>&1 &

echo -n "Waiting for r2-dev-gateway on :$PORT"
for i in $(seq 1 $TIMEOUT); do
  if curl -s -o /dev/null -m 1 "http://localhost:$PORT/health" 2>/dev/null; then
    echo ""
    echo "✓ r2-dev-gateway ready (${i}s)"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "✗ r2-dev-gateway did not respond within ${TIMEOUT}s — last log lines:"
tail -20 /tmp/r2-dev-gateway.log
exit 1
