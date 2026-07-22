#!/usr/bin/env bash
# Run the same checks CI runs for backend/, locally, in one command.
set -euo pipefail
cd "$(dirname "$0")/../backend"

echo "== ruff =="
./.venv/Scripts/python.exe -m ruff check .

echo "== pytest =="
./.venv/Scripts/python.exe -m pytest -q

echo "== alembic history/heads (no DB required) =="
./.venv/Scripts/python.exe -m alembic history
./.venv/Scripts/python.exe -m alembic heads
