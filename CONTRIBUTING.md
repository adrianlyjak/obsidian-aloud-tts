# Installation and Development

This project uses pnpm as its package manager. To get started, make sure you have `corepack` enabled by running `corepack enable`, and then run `pnpm install` to install the dependencies.

From there, you can run the package.json scripts:

- Run tests with `pnpm run test`
- Lint with `pnpm run lint`
- Reformat with `pnpm run format:write`
- `pnpm run dev` to start the development build of the plugin. (More on this below)
- `pnpm run build` to bundle the build for release

### Installing the plugin

Follow the [obsidian documentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) for how to install a plugin in development.

Effectively, you'll need to move this repository into your `.obsidian/plugins` folder, and then run the `pnpm run dev` command. From there, you'll need to enable the plugin. Additinoally, it's recommended to install the hot-reload plugin so you don't need to reload or toggle the plugin to see updates.

### Notes for maintainers on how to release

1. Get the change to the main branch.
2. Run `./version-bump.sh`. It bumps the current version from package.json, and adds it to other obsidian files and creates a tag and pushes it. See error message for usage. For example, when starting from `0.1.0`, run `./version-bump.sh patch rc` to create a new patch version. This will adjust the version to `0.1.1-rc1`. If that looks good, run `version-bump.sh release` to create a new release from the candidate e.g. `0.1.1`
3. Wait for github action. Release the Draft in github UI

## Running the web app

This keeps obsidian at arms distance, allowing it to be run also in your browser! (Not firefox right now).
This makes developing simple features faster and debugging safari web views easier.

To run it:

```sh
pnpm run web:dev
```
It's a bit janky, visit, http://localhost:5173/src/web/ 