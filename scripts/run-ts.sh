#!/usr/bin/env bash
# Run the TypeScript bot.
#
# Usage: ./run-ts.sh [debug]
#   debug -> command prefix becomes `~` instead of `!`
#
# The token is read from .token (never passed on the command line, unlike the
# Java bot, where it was visible in `ps`). Set REDIS_HOST to enable persistence.
set -euo pipefail

cd "$(dirname "$0")"

TOKEN_FILE="$PWD/.token"
if [[ ! -f "$TOKEN_FILE" ]]; then
  echo "Missing .token" >&2
  exit 1
fi

# Set DISCORD_TOKEN explicitly from the file rather than relying on precedence.
# An ambient DISCORD_TOKEN for some *other* bot is otherwise picked up instead,
# and the symptom is silent: a bot logs in fine, just not the one you meant.
DISCORD_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
export DISCORD_TOKEN
unset DISCORD_TOKEN_FILE

echo "Using token from $TOKEN_FILE"

cd savagebot-ts

if [[ ! -d dist ]]; then
  echo "No dist/ -- building first." >&2
  npm run build
fi

exec node --enable-source-maps dist/main.js "$@"
