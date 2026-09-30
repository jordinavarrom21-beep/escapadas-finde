#!/bin/bash
# Sesiones de Claude Code en la web: instala las dependencias para que funcionen
# npm test, npm run lint y las pruebas del navegador (Playwright usa el Chromium que
# ya trae el contenedor; no se descarga otro).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
# npm install (no ci) aprovecha lo que ya haya en node_modules y la caché del contenedor.
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --ignore-scripts --no-audit --no-fund
