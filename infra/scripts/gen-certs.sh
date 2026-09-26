#!/usr/bin/env bash
# Generate a local development CA and a broker server certificate.
#
# LOCAL DEVELOPMENT ONLY. These certs are self-signed, live in infra/mosquitto/certs
# (gitignored) and must never be used off this machine. A deployment uses real
# certificates supplied through the environment.
set -euo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/mosquitto/certs"
DAYS=825

if [[ -f "${CERT_DIR}/server.crt" && "${1:-}" != "--force" ]]; then
  echo "certs already present in ${CERT_DIR} (pass --force to regenerate)"
  exit 0
fi

mkdir -p "${CERT_DIR}"
cd "${CERT_DIR}"

openssl req -x509 -newkey rsa:2048 -nodes -days "${DAYS}" \
  -keyout ca.key -out ca.crt \
  -subj "/CN=agri-local-dev-ca/O=Agri Robot Store (local dev)" 2>/dev/null

openssl req -newkey rsa:2048 -nodes \
  -keyout server.key -out server.csr \
  -subj "/CN=mosquitto/O=Agri Robot Store (local dev)" 2>/dev/null

cat > server.ext <<'EXT'
subjectAltName = DNS:mosquitto, DNS:localhost, IP:127.0.0.1
extendedKeyUsage = serverAuth
EXT

openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days "${DAYS}" -extfile server.ext 2>/dev/null

rm -f server.csr server.ext ca.srl
# Mosquitto drops to an unprivileged user inside the container and must read the key.
chmod 644 ca.crt server.crt server.key
echo "wrote ca.crt, server.crt, server.key to ${CERT_DIR}"
