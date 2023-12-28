
#!/bin/bash
set -ex

if [ -z "$1" ] ; then
  echo "Usage: $0 <major|minor|patch|release> [rc]
where 
  - <major|minor|patch> increment their corresponding semantic version 
  - <release> leaves the semantic version alone
  - [rc] adds the rc suffix, incrementing it by one if necessary
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
