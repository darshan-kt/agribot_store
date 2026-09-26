#!/usr/bin/env bash
# Render the SeaweedFS S3 identity file from the credentials in .env.
#
# The committed s3.json holds placeholders only; the rendered file with real keys is
# gitignored, like every other generated credential in infra/.
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(dirname "${INFRA_DIR}")"
OUT="${INFRA_DIR}/seaweedfs/s3.generated.json"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

: "${S3_ACCESS_KEY:?set S3_ACCESS_KEY in .env}"
: "${S3_SECRET_KEY:?set S3_SECRET_KEY in .env}"

sed -e "s|S3_ACCESS_KEY_PLACEHOLDER|${S3_ACCESS_KEY}|" \
    -e "s|S3_SECRET_KEY_PLACEHOLDER|${S3_SECRET_KEY}|" \
    "${INFRA_DIR}/seaweedfs/s3.json" > "${OUT}"
chmod 644 "${OUT}"
echo "wrote ${OUT}"
