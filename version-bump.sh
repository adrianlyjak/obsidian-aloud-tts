
#!/bin/bash
set -ex
node version-bump.mjs $1 $2
git add manifest.json versions.json package.json
VERSION="$(cat package.json | jq .version -r)"
git commit -m "update version to $VERSION"
git tag -a $VERSION -m "Version $VERSION"
git push
git push origin $VERSION
