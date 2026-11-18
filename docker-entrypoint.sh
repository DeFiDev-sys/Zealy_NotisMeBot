#!/bin/sh
set -e

# Ensure data directory exists and has correct permissions
mkdir -p /app/data
chown -R node:node /app/data 2>/dev/null || true

# Execute the main command as node user
exec su-exec node "$@"