# Contributing

This repo is a **source mirror** of `packages/cli/` from the [driftlog monorepo](https://github.com/herocodess/driftlog). It stays in sync automatically via GitHub Actions whenever the monorepo's `main` branch is updated.

## Issues and Pull Requests

- **Bug reports and small fixes**: Submit PRs here directly — they'll be merged and synced back to the monorepo.
- **Large features or architectural changes**: Please also open a tracking issue in the [main driftlog repo](https://github.com/herocodess/driftlog/issues) so the maintainers can align on scope and design across the full project.

## Development

The CLI depends on several private `@driftlog/*` packages from the monorepo that are bundled at build time. To contribute features:

1. Clone the [main driftlog monorepo](https://github.com/herocodess/driftlog)
2. Work in `packages/cli/` alongside the parser, types, and config packages
3. Run `pnpm build` and `pnpm test`
4. Your changes sync here automatically when merged to `main`

## License

MIT
