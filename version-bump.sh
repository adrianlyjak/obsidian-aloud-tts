
#!/bin/bash
set -e

if [ -z "$1" ] || [ "$1" '==' "--help" ] ; then
  echo "Usage: $0 <command> [rc]
commands
  major [rc] - increments the major version, optionally adding an auto incrementing rc suffix
  minor [rc] - increments the minor version, optionally adding an auto incrementing rc suffix
  patch [rc] - increments the patch version, optionally adding an auto incrementing rc suffix
  rc         - increments the current rc suffix version
  release    - releases the current rc suffix version
  specified <version> - sets the version to the specified version string
"
  exit 1
fi

node version-bump.mjs $1 $2

# In CI (GitHub Actions), do not create commits/tags or push directly.
# Leave changes uncommitted so the workflow can open a PR with them.
if [ "${GITHUB_ACTIONS:-}" = "true" ] || [ "${CI:-}" = "true" ]; then
  echo "CI detected; skipping git commit, tag, and push. A PR will be created by the workflow."
  exit 0
fi

git add manifest.json versions.json package.json
VERSION="$(jq -r .version package.json)"
git commit -m "update version to $VERSION"
git tag -a "$VERSION" -m "Version $VERSION"
git push
git push origin "$VERSION"
