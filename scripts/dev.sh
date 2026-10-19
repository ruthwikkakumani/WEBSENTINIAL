#!/bin/sh
# Starts the registry, the checker, and the website. Ctrl-C stops all three.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"
mkdir -p data services/rdap/build

if lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 8080 is already in use."
  exit 1
fi
if lsof -nP -iTCP:8082 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 8082 is already in use."
  exit 1
fi

javac --release 21 -d services/rdap/build services/rdap/src/sentinel/*.java
java -cp services/rdap/build sentinel.Main 8082 &
JAVA_PID=$!
(
  cd services/core
  go run ./cmd/sentinel -addr 127.0.0.1:8080 -rdap http://127.0.0.1:8082 -data "$ROOT/data/history.json"
) &
GO_PID=$!

cleanup() {
  kill "$JAVA_PID" "$GO_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Registry  http://127.0.0.1:8082"
echo "Checker   http://127.0.0.1:8080"
echo "Website   http://127.0.0.1:5173"
cd apps/web
if [ ! -d node_modules ]; then
  npm install
fi
npm run dev
