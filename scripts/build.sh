#!/usr/bin/env bash
# Build savagebot. openjdk@17 is keg-only and the shell doesn't persist env,
# so JAVA_HOME is pinned here rather than exported once.
set -euo pipefail

export JAVA_HOME="$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

cd "$(dirname "$0")/savagebot"
exec mvn "$@" clean compile assembly:single
