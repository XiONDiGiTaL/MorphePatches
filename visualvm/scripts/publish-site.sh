#!/usr/bin/env sh
# Publish the built app into the main site repo so it serves from
# https://xiondigital.net/visualvm/
#
#   ./scripts/publish-site.sh [path-to-xiondigital.github.io]
#
# Builds with the Pages subpath base, mirrors dist/ into <site>/visualvm/ and
# commits, matching how /arcade/ and /meldra/ are laid out. Re-running replaces
# the previous build in place, so stale hashed assets do not accumulate.
set -eu

SITE="${1:-../xiondigital.github.io}"
cd "$(dirname "$0")/.."

if [ ! -d "$SITE/.git" ]; then
  echo "not a git clone of the site repo: $SITE" >&2
  exit 1
fi

VITE_BASE=/visualvm/ npm run build

mkdir -p "$SITE/visualvm"
find "$SITE/visualvm" -mindepth 1 -delete
cp -R dist/. "$SITE/visualvm/"

git -C "$SITE" add visualvm
if git -C "$SITE" diff --cached --quiet; then
  echo "nothing to publish: visualvm/ is already up to date"
  exit 0
fi

git -C "$SITE" commit -m "chore(visualvm): publish build to /visualvm/"
git -C "$SITE" push
