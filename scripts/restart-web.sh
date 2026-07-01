#!/usr/bin/env bash
PORT=4200
TIMEOUT=20

echo "Restarting web server from: $(pwd)"

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
