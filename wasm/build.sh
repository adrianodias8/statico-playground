#!/usr/bin/env bash
# Builds what the playground needs from Statico: statico.wasm, and its
# starter templates as JSON. Statico is checked out at a pinned commit into
# .build/, wasm/statico-wasm.patch is applied there, and nothing is ever
# pushed back: Statico's own repository stays as it is.
#
#   wasm/build.sh                     # Statico from GitHub, at STATICO_REF
#   STATICO_REPO=../statico wasm/build.sh
set -euo pipefail

STATICO_REPO="${STATICO_REPO:-https://github.com/adrianodias8/statico}"
STATICO_REF="${STATICO_REF:-6c9f683b18b911deb1c79aa64b67ea9fe8757472}"

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
work="$root/.build/statico"

rm -rf "$work"
git clone --quiet "$STATICO_REPO" "$work"
git -C "$work" checkout --quiet "$STATICO_REF"
git -C "$work" apply "$here/statico-wasm.patch"

# The build output lives outside the throwaway checkout, so CI can cache it.
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$root/.build/target}"
rustup target add wasm32-wasip1 >/dev/null
cargo build --quiet --manifest-path "$work/Cargo.toml" --release \
  --bin statico-wasm --no-default-features --target wasm32-wasip1
cp "$CARGO_TARGET_DIR/wasm32-wasip1/release/statico-wasm.wasm" "$root/public/statico.wasm"

mkdir -p "$root/public/templates"
python3 "$here/pack.py" "$root/starters/hello" "$root/public/templates/hello.json"
python3 "$here/pack.py" "$work/templates/blog" "$root/public/templates/blog.json"
python3 "$here/pack.py" "$work/templates/docs" "$root/public/templates/docs.json"
git -C "$work" rev-parse --short HEAD > "$root/public/statico-version.txt"

echo "statico.wasm: $(wc -c < "$root/public/statico.wasm") bytes, Statico $(cat "$root/public/statico-version.txt")"
