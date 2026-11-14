#!/bin/sh
set -e
mkdir -p "${DATA_DIR:-/data}/files"
chown -R 65534:65534 "${DATA_DIR:-/data}"
exec su-exec 65534:65534 python serve.py --host 0.0.0.0 --port 8080
