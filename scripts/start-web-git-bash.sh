#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root/web"

if [[ ! -d node_modules ]]; then
  npm install
fi

echo "TransiSafe Web: http://localhost:5173"
npm run dev -- --host 127.0.0.1 --port 5173
