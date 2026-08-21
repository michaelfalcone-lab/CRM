#!/usr/bin/env bash
# Runs a command with JAVA_HOME/PATH set to a working JDK.
#
# The Firebase Local Emulator Suite's Firestore emulator requires a Java
# runtime that isn't part of the Node/Firebase toolchain. This repo does not
# assume `java` is already on PATH — use this wrapper for any command that
# invokes `firebase emulators:*` (rules tests, functions tests, manual
# verification), e.g.:
#
#   scripts/with-java.sh firebase emulators:exec --only firestore,auth,functions 'npm run test:rules'
#
# Resolution order:
#   1. An already-valid JAVA_HOME in the environment (respects whatever the
#      caller/CI has set up).
#   2. `/usr/libexec/java_home` (macOS's system JDK locator), if it finds one.
#   3. A local, non-sudo JDK installed at ~/.local/opt/jdk-*/Contents/Home
#      (the install path used when no system Java was available).
set -euo pipefail

resolve_java_home() {
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    echo "$JAVA_HOME"
    return 0
  fi

  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    local sys_home
    if sys_home=$(/usr/libexec/java_home 2>/dev/null); then
      echo "$sys_home"
      return 0
    fi
  fi

  local local_home
  local_home=$(ls -d "$HOME"/.local/opt/jdk-*/Contents/Home 2>/dev/null | sort -V | tail -n 1 || true)
  if [ -n "$local_home" ] && [ -x "$local_home/bin/java" ]; then
    echo "$local_home"
    return 0
  fi

  return 1
}

if ! JAVA_HOME=$(resolve_java_home); then
  echo "with-java.sh: no usable Java runtime found (checked JAVA_HOME, java_home, ~/.local/opt/jdk-*)." >&2
  echo "Install a JDK (e.g. https://adoptium.net) or set JAVA_HOME manually." >&2
  exit 1
fi

export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

exec "$@"
