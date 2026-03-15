#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WASM_DIR="$SCRIPT_DIR/wasm"
PUBLIC_DIR="$SCRIPT_DIR/public"

mkdir -p "$PUBLIC_DIR"

echo "Building Go WASM module..."
(cd "$WASM_DIR" && GOOS=js GOARCH=wasm go build -o "$PUBLIC_DIR/pdf.wasm" .)

echo "Copying wasm_exec.js from Go runtime..."
GOROOT="$(go env GOROOT)"
cp "$GOROOT/lib/wasm/wasm_exec.js" "$PUBLIC_DIR/wasm_exec.js"

echo "Done: public/pdf.wasm and public/wasm_exec.js are ready."
