#!/usr/bin/env bash
# Create .env from .env.example, replacing every `change-me` with a fresh random secret.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  echo ".env already exists — leaving it alone"
  exit 0
fi

python3 - "${ROOT_DIR}" <<'PY'
import pathlib
import re
import secrets
import sys

root = pathlib.Path(sys.argv[1])
text = (root / ".env.example").read_text()
text = re.sub(r"change-me", lambda _: secrets.token_urlsafe(24), text)
(root / ".env").write_text(text)
PY

chmod 600 "${ROOT_DIR}/.env"
echo "wrote .env with generated secrets (mode 600)"
