# Releasing

## Version sync

Update all of these in one commit:

```text
package.json
dsh-plugin.json
index.js (VERSION)
CHANGELOG.md
README.md (badge / install examples if versioned)
docs/INTERFACE.md (if the contract changed)
market-index.json
```

## Pre-release checks

```powershell
node --check index.js
node --test test/core.test.js test/command.test.js
npm pack --dry-run
```

Checks: no local paths, tokens, private keys or real email addresses in the packed files;
`files` covers every runtime file; `engines.dsh` matches the tested DSH series.

## GitHub

```powershell
git add -A
git commit -m "Release x.y.z"
git tag -a vx.y.z -m "dsh-remote-access x.y.z"
git push origin main
git push origin vx.y.z
npm pack
gh release create vx.y.z "game25011-dsh-remote-access-x.y.z.tgz" `
  --title "dsh-remote-access x.y.z" `
  --notes-file release-notes.md
```

### Stable asset (required for market links)

Upload **both** assets to the release:

1. versioned: `game25011-dsh-remote-access-x.y.z.tgz`
2. stable:   `game25011-dsh-remote-access.tgz`

The market entry uses
`https://github.com/game25011/dsh-remote-access/releases/latest/download/game25011-dsh-remote-access.tgz`;
if only the versioned asset exists, that URL 404s.

## npm

The source package name equals the npm name, so publish directly:

```powershell
npm login --registry https://registry.npmjs.org
npm publish --access public --registry https://registry.npmjs.org
```

### Known npm pitfalls

- **E401** — login expired; run `npm whoami`, then `npm login` again.
- **EOTP** — publishing needs a separate 2FA pass in an interactive terminal; non-interactive
  shells cannot complete it.
- **E409 staged publish** — wait 1–10 minutes; do not bump the version. Check
  `npm view <pkg> version` and the tarball before retrying.
- Metadata visible but tarball 404 — CDN backfill delay; keep polling the tarball, do not republish.

## Post-release verification

```powershell
npm view "@game25011/dsh-remote-access" version --registry https://registry.npmjs.org
npm pack "@game25011/dsh-remote-access@x.y.z" --registry https://registry.npmjs.org
```

Unpack the tarball and check `package.json.name/version` plus the expected files.
Also verify the GitHub release has both tgz assets and the stable URL returns 200.

## Market index

After the release commit exists, fill `commit` in `market-index.json`, bump
`publishTimestamp`, and submit to the plugin market (PR to awesome-dsh-plugin if needed).
