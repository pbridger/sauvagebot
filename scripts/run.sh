#!/usr/bin/env bash
# Run savagebot against the token in .token (never passed on the CLI by the user,
# though note the JAR's own arg design still exposes it in `ps` -- see HANDOFF).
#
# Usage: ./run.sh [debug]
#   debug -> default command prefix becomes `~` instead of `!`, so a test
#            instance can't be confused with the public bot on the same server.
set -euo pipefail

cd "$(dirname "$0")"

export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

if [[ ! -f .token ]]; then
  echo "Missing .token -- put the Discord bot token in it (chmod 600)." >&2
  exit 1
fi
TOKEN="$(tr -d '[:space:]' < .token)"

JAR=savagebot/target/savagebot-0.2.0-SNAPSHOT-jar-with-dependencies.jar
if [[ ! -f "$JAR" ]]; then
  echo "Missing $JAR -- run ./build.sh first." >&2
  exit 1
fi

# Positional args: password token redisHost redisPort redisPass [debug]
# `debug` is args[5], so reaching it requires supplying redis args 3-5.
# RedisClient swallows connection failures at log.debug, so a dead host is
# harmless -- state just isn't persisted across restarts.
MODE="${1:-}"
if [[ "$MODE" == "debug" ]]; then
  exec java -jar "$JAR" savagebot-local "$TOKEN" 127.0.0.1 6379 dummyPass debug
else
  exec java -jar "$JAR" savagebot-local "$TOKEN"
fi
