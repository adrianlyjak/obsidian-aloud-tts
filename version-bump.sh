
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
git add manifest.json versions.json package.json
VERSION="$(cat package.json | jq .version -r)"
git commit -m "update version to $VERSION"
git tag -a $VERSION -m "Version $VERSION"
git push
git push origin $VERSION
