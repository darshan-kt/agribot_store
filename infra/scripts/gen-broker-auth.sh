#!/usr/bin/env bash
# Build the Mosquitto password file from the credentials in .env.
#
# Passwords never live in the repository: this reads them from the environment and
# writes a hashed password file that is gitignored.
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(dirname "${INFRA_DIR}")"
PASSWD="${INFRA_DIR}/mosquitto/passwd"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.env"
  set +a
fi

: "${MQTT_API_PASSWORD:?set MQTT_API_PASSWORD in .env}"
: "${MQTT_ROBOT_PASSWORD:?set MQTT_ROBOT_PASSWORD in .env}"

: > "${PASSWD}"
docker run --rm -v "${INFRA_DIR}/mosquitto:/work" eclipse-mosquitto:2 \
  mosquitto_passwd -b /work/passwd api "${MQTT_API_PASSWORD}"
docker run --rm -v "${INFRA_DIR}/mosquitto:/work" eclipse-mosquitto:2 \
  mosquitto_passwd -b /work/passwd scout-01 "${MQTT_ROBOT_PASSWORD}"
chmod 644 "${PASSWD}"
echo "wrote ${PASSWD} for users: api, scout-01"
