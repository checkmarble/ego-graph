# Contributing

Thanks for your interest in `ego-graph`.

## Issues first

We prefer issues before code.

1. Open an issue describing the bug or proposed change.
2. Maintainers triage it.
3. If we want the change, we will invite you to collaborate or open a draft PR ourselves.

Unsolicited PRs from new contributors may be closed with a request to start from an issue. Dependabot and other bot PRs are welcome.

## Local setup

This repo uses [Bun](https://bun.sh).

```sh
bun install
```

Useful scripts:

| Script | What it does |
| --- | --- |
| `bun run test` | Run [Vitest](https://vitest.dev) tests |
| `bun run type-check` | TypeScript (`tsc --noEmit`) |
| `bun run lint` | Lint with [Biome](https://biomejs.dev) |
| `bun run format` | Format with Biome |
| `bun run build` | Build `dist/` with tsdown |
| `bun run check-package` | Publint + arethetypeswrong |

Before opening a PR (when invited), run:

```sh
bun run type-check && bun run test && bun run lint && bun run build
```

## Bug reports

Include:

- What you expected
- What actually happened
- Steps to reproduce
- Package version, Node version, and a minimal repro if possible

Use the bug report issue template.

## Feature requests

Include motivation, a sketch of the API you want, and a short usage example. Use the feature request issue template.

## Release / versioning

We use **manual semver**. Maintainers bump `version` in `package.json`, push a `vX.Y.Z` tag, and GitHub Actions publishes to npm and creates a GitHub Release.
