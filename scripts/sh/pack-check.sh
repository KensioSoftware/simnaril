#!/usr/bin/env bash
#
# What `pnpm publish` would actually upload, checked before it can be uploaded.
#
# `files` in package.json and the `exports` map are two lists that have to agree
# and nothing else makes them: a path can be exported and not packed, and the
# failure shows up as a bare "Cannot find module" for whoever installs it. That
# is the wrong place to find out, so it is found out here instead.
#
# Run by `pnpm check` and by the build job in both workflows.

set -euo pipefail

cd "$(dirname "$0")/../.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Builds the tarball for real — prepack runs, so this is the same dist/ a
# publish would ship — and leaves it somewhere the repository will not notice.
tarball="$(pnpm pack --pack-destination "$tmp" | tail -n 1)"

contents="$(tar --list --file "$tarball")"

# npm rewrites every path in a tarball under `package/`.
expected=(
  package/package.json
  package/README.md
  package/LICENSE
  package/dist/index.js
  package/dist/index.d.ts
)

missing=()
for path in "${expected[@]}"; do
  grep --quiet --line-regexp --fixed-strings "$path" <<<"$contents" ||
    missing+=("$path")
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "Missing from the tarball:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  echo >&2
  echo "What is in it:" >&2
  sed 's/^/  /' <<<"$contents" >&2
  exit 1
fi

# Nothing here is meant to ship test files or source maps of sources that are
# not in the tarball. Catching that is cheaper than a bug report about package
# size.
if grep --quiet --extended-regexp 'package/dist/.*\.(test|spec)\.' <<<"$contents"; then
  echo "Test files reached the tarball:" >&2
  grep --extended-regexp 'package/dist/.*\.(test|spec)\.' <<<"$contents" >&2
  exit 1
fi

echo "Tarball looks right:"
sed 's/^/  /' <<<"$contents" | sort
