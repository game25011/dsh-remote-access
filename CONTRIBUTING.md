# Contributing

## Development setup

- Node.js >= 20 (tested with 24).
- No install step: the plugin has zero runtime dependencies.
- A DSH 0.2.2 profile is only needed for manual integration tests.

## Checks

```sh
node --check index.js
node --test test/core.test.js test/command.test.js
npm pack --dry-run
```

## Pull requests

- Keep the host-only design: no client bundle unless it has a clear purpose.
- Do not add runtime dependencies without discussion.
- Keep `package.json`, `dsh-plugin.json`, `index.js (VERSION)`, `CHANGELOG.md` and
  `market-index.json` in sync when versions change.
- Never commit tokens, cookies, private keys or machine-specific host names.
