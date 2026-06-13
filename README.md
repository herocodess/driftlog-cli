# driftlog

> Architectural drift detection for your codebase. One binary, runs locally, no network.

`driftlog` walks your repo, parses your code with tree-sitter, and reports violations of architectural rules you define in `.driftlog.yaml` — layer breaches, forbidden imports, circular dependencies, module isolation, and pattern bans.

## Install

```bash
npm install -g driftlog
# or
pnpm add -g driftlog
# or run without installing:
npx -y driftlog check
```

## Quickstart

```bash
driftlog init        # drop a starter .driftlog.yaml
driftlog check       # scan the repo
driftlog rule list   # see active rules
```

## Privacy

The v1 CLI is **fully local**. No code, no telemetry, no analytics, no auth — zero network calls under any flag combination. Your code never leaves your environment.

## Commands

### `driftlog check [path]`

Run all rules against the repo (or `path`). Prints a table of violations, a summary, and a drift score (0-100). Exit code: `0` clean, `1` on error-severity violations, `2` on usage error.

```bash
driftlog check
driftlog check src/
driftlog check --json > drift.json
driftlog check --strict             # promote warnings to errors
driftlog check --changed-only       # only files changed vs origin/main
driftlog check --base HEAD~10       # change the diff base
driftlog check --rule layer-breach  # only this rule
```

When `GITHUB_ACTIONS=true`, the CLI auto-emits `::error::` / `::warning::` annotations and (if `GITHUB_STEP_SUMMARY` is set) appends a Markdown summary table.

### `driftlog init`

Drop a starter `.driftlog.yaml`. Auto-detects TS / JS / Dart / mixed based on what's in the repo. Refuses to overwrite without `--force`.

```bash
driftlog init
driftlog init --template dart
driftlog init --force
```

### `driftlog score`

Print just the drift score and the rules contributing most violations.

```bash
driftlog score
driftlog score --json
driftlog score --rule layer-breach
```

`--window <duration>` is accepted but a no-op locally (trailing-window scoring lives in the cloud product).

### `driftlog rule list | new <type> | test <id>`

```bash
driftlog rule list                  # print built-in + custom rules
driftlog rule new pattern --id no-jquery
driftlog rule test layer-breach     # run one rule, verbose
```

`rule new` types: `layer`, `forbidden`, `boundary`, `cycle`, `module`, `pattern`.

### `driftlog ci github | gitlab | circle`

Generate a CI config tailored to your provider.

```bash
driftlog ci github               # writes .github/workflows/driftlog.yml
driftlog ci gitlab --strict      # writes .driftlog-gitlab-ci.yml
driftlog ci circle               # writes .circleci/driftlog.yml
```

`gitlab` and `circle` emit standalone files that you include from your existing pipeline — they don't merge into your existing YAML.

## Global flags

| Flag | Behaviour |
|---|---|
| `--config <path>` | Use this config file. Bypasses walk-up discovery. |
| `--cwd <dir>` | Working directory. Defaults to `$PWD`. |
| `--no-color` | Disable ANSI colour. Auto-disabled in CI. |
| `--json` | Emit a single JSON document (mutes human output). |
| `--quiet` / `-q` | Suppress info/dim lines. Errors and warnings still print. |
| `--verbose` / `-v` | Verbose progress, per-file parser timing. |
| `--help` / `-h` | Print help. |
| `--version` | Print the CLI version (`1.0.0`). |

## Config discovery

`.driftlog.yaml` is discovered in this order:

1. `--config <path>`
2. `DRIFTLOG_CONFIG` env var
3. Walk up from cwd, stopping at the first `.driftlog.yaml` or at the repo root (`.git`)
4. cwd
5. None → default config kicks in (`DEFAULT_CONFIG_V1`)

When defaults are used, the CLI prints a one-line tip to run `driftlog init`.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean scan (warnings allowed unless `--strict`) |
| `1` | Violations exist, or `--strict`/`--strict-parse` upgrades warnings |
| `2` | Usage error: bad flag, missing config, git ref invalid, runtime error |

## CI examples

### GitHub Actions

```yaml
name: Driftlog
on: [pull_request, push]
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npx -y driftlog@^1 check
```

`driftlog ci github` writes this for you.

### GitLab CI

```yaml
include: '.driftlog-gitlab-ci.yml'
```

`driftlog ci gitlab` writes the included file.

## Known limitations (v1.0.0)

- **No autofix.** `driftlog fix` is reserved for v1.1; the autofix engine is not yet built.
- **No history.** `score --window` is a no-op; trailing-window scoring requires the cloud product.
- **TypeScript path aliases unresolved.** Imports that go through a `tsconfig.json` `paths` alias may be skipped. The CLI surfaces a warning when it detects this.
- **No concurrent parsing.** Files are scanned sequentially; the parser holds a single tree-sitter instance per language.

## Pre-publish checklist

Before publishing a new version to npm, run the production-realistic Linux
smoke against the actual tarball that would ship:

```bash
# From the repo root.
pnpm --filter driftlog build
(cd packages/cli && pnpm pack)
TARBALL=$(ls packages/cli/driftlog-cli-*.tgz | head -1)

docker run --rm --platform linux/amd64 \
  -v "$PWD/$TARBALL":/cli.tgz \
  -v "$PWD/packages/cli/test/fixtures/smoke":/smoke \
  node:18-bullseye bash -c "\
    npm i -g /cli.tgz && \
    driftlog --version && \
    cd /smoke && (driftlog check --json; echo exit=\$?)"
```

Expected output: prints `1.0.0`, then a JSON document with `summary.errors: 1`,
then `exit=1`. This is the most production-realistic verification short of an
actual publish.

The CI matrix at `.github/workflows/cli-smoke.yml` covers Ubuntu, macOS, and
Windows on Node 18 + 20 against the bundled bin (`dist/cli.cjs`), so packaging
regressions land in the PR rather than in the npm tarball.

## License

MIT
