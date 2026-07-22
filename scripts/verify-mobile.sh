#!/usr/bin/env bash
# Run the same checks CI runs for mobile/, locally, in one command.
set -euo pipefail
cd "$(dirname "$0")/../mobile"

echo "== expo install --check =="
npx expo install --check

echo "== typecheck =="
npm run typecheck

echo "== lint =="
npm run lint

echo "== expo-doctor =="
npx expo-doctor
