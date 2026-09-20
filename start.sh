#!/usr/bin/env bash
# Double-click (on some systems) or run `./start.sh` to launch the app
# locally. Requires Node.js; see README.md for a Python fallback.
set -e
cd "$(dirname "$0")"
node server.js
