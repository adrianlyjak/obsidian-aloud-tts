General guidance:
- Tooling and package manager: use pnpm. Enable with `corepack enable`; install with `pnpm install`.
- Linting and formatting: run `pnpm run lint` (eslint). Format with `pnpm run format` (prettier). CI and pre-commit use lint-staged to check `src/**/*.{ts,tsx}` with prettier --check and eslint.
- Type checking and builds: `pnpm run typecheck` must pass; `pnpm run build` runs typecheck then bundles via esbuild config.
- Tests: run `pnpm run test` (vitest run). Tests use jsdom and extend `expect` with `@testing-library/jest-dom` via `test-setup.ts`. Prefer mocking only fetch/IO boundaries; keep tests small and typed. We want high coverage, fast tests, but balance with minimal tests and minimal mocking to make the tests easy to maintain.
- Code style: always type function arguments and return values; avoid `any`. Prefer descriptive names and early returns. Keep comments minimal and purposeful.
- UI/tests: use Testing Library patterns; avoid relying on implementation details. Clean DOM state is handled in `test-setup.ts`.

Detailed documentation index:
- [overall-structure.md](architecture-docs/overall-structure.md) explains the high level design of the audio system, and its integration with Obsidian.
- [audio-player.md](architecture-docs/audio-player.md) explains in detail the state machine and flow of the audio player.
- [adding-a-provider.md](architecture-docs/adding-a-provider.md) explains how to add a new TTS provider to the audio system.

## Styling Guidance

Use "Title Case" for headings. Within the settings section, use full sentence descriptions with periods.