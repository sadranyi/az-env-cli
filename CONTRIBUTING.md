# Contributing to az-env-cli

Thanks for your interest. Bug reports, feature suggestions, and PRs are welcome.

## Getting set up

```bash
git clone https://github.com/sadranyi/az-env-cli.git
cd az-env-cli
npm install
npm run build
npm test
```

Requires Node 18 or newer.

## Workflow

- **All changes go through a pull request**, including from maintainers — `main` is protected and requires CI to pass before merge.
- **Branch off `main`**, name your branch with a topic prefix: `feat/...`, `fix/...`, `docs/...`, `chore/...`, `test/...`, `refactor/...`.
- **Commit messages** follow loose conventional-commits style: first line is `<type>: <subject>`, where type is one of `feat`, `fix`, `docs`, `chore`, `ci`, `test`, `refactor`. The body explains *why*, not *what*.
- **CI must pass** on Node 18 / 20 / 22 across Ubuntu and Windows before merge.
- **Squash-merge** is the default to keep `main` history linear.

## Local development

```bash
npm run dev -- export example/.env.example     # run the CLI directly via tsx
npm run build && node dist/cli.js export ...   # run the compiled output
npm run test:watch                              # vitest in watch mode
npm run test:coverage                           # generate a coverage report
```

## Tests

- Tests live in `tests/` and use [vitest](https://vitest.dev).
- Add a test for any user-visible behavior change. We aim to keep coverage at or above the current level.
- `src/cli.ts`, `src/banner.ts`, `src/index.ts`, and `src/commands/**` are excluded from coverage scope (CLI wiring, presentation, re-exports).

## Adding a new subcommand

Each subcommand lives in `src/commands/<name>.ts` and exports a `register<Name>(program: Command)` function called from `src/cli.ts`. Keep the command file thin — push business logic into a sibling module that's easier to unit-test.

## Reporting bugs

Open an issue using the **Bug report** template. Include the CLI version (`az-env --version`), Node version, OS, and a minimal `.env` that reproduces the issue (with secrets redacted).

## Suggesting features

Open an issue using the **Feature request** template. Describe the problem before proposing a solution.

## Releasing (maintainers)

1. Open a PR bumping the version (`npm version <patch|minor|major> --no-git-tag-version`).
2. Squash-merge to `main` once CI is green.
3. Tag the merge commit: `git tag -a vX.Y.Z <sha> -m "..."` then `git push origin vX.Y.Z`.
4. Create a GitHub Release from the tag with notes.
5. `npm publish` — the `prepublishOnly` hook re-runs `npm run build && npm test` as a guard.
