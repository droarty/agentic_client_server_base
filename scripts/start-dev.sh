#!/usr/bin/env bash
set -e

# ── MongoDB ───────────────────────────────────────────────────────────────────
if ! docker ps --format '{{.Names}}' | grep -q '^mongo$'; then
  if docker ps -a --format '{{.Names}}' | grep -q '^mongo$'; then
    echo "Starting existing mongo container..."
    docker start mongo
  else
    echo "Creating and starting mongo container..."
    docker run -d --name mongo -p 27017:27017 mongo:7
  fi
else
  echo "mongo container already running."
fi

# ── Redis ─────────────────────────────────────────────────────────────────────
if ! docker ps --format '{{.Names}}' | grep -q '^redis$'; then
  if docker ps -a --format '{{.Names}}' | grep -q '^redis$'; then
    echo "Starting existing redis container..."
    docker start redis
  else
    echo "Creating and starting redis container..."
    docker run -d --name redis -p 6379:6379 redis:7
  fi
else
  echo "redis container already running."
fi

echo ""
echo "Services ready. Run the following in separate terminals:"
echo "  npx nx serve api"
echo "  npx nx serve web"
