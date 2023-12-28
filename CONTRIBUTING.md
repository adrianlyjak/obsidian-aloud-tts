# How to release

1. Get the change to the main branch. 
2. Run `./version-bump.sh`. It bumps the current version from package.json, and adds it to other obsidian files and creates a tag and pushes it. See error message for usage. For example, when starting from `0.1.0`, run `./version-bump.sh patch rc` to create a new patch version. This will adjust the version to  `0.1.1-rc1`. If that looks good, run `version-bump.sh release` to create a new release from the candidate e.g. `0.1.1`
3. Wait for github action. Release the Draft in github UI

