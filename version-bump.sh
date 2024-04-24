
#!/bin/bash
set -ex

if [ -z "$1" ] ; then
  echo "Usage: $0 <command> [args] <major|minor|patch|release> [rc]
commands
  major [rc] - increments the major version, optionally adding an auto incrementing rc suffix
  minor [rc] - increments the minor version, optionally adding an auto incrementing rc suffix
  patch [rc] - increments the patch version, optionally adding an auto incrementing rc suffix
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
