#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

echo "Updating native TransiSafe C engine..."
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release --target transisafe_json

if [[ ! -d api/.venv ]]; then
  python -m venv api/.venv
fi

source api/.venv/Scripts/activate 2>/dev/null || source api/.venv/bin/activate
python -m pip install -r api/requirements.txt
echo "TransiSafe API: http://localhost:8000"
python -m uvicorn api.main:app --reload --host 127.0.0.1 --port 8000
