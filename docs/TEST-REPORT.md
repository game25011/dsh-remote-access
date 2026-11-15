# Test report

- Date: 2026-11-15
- Environment: Windows 11, Node.js v24.19.0, DSH 0.2.2-rc.1 (desktop app)
- Command: `node --test test/core.test.js test/command.test.js`
- Result: 6 passed / 0 failed

| Test | Covers |
|---|---|
| effectiveConfig | defaults, string coercion, `serve: false` |
| derivePublicUrl | MagicDNS name parsing, missing name |
| buildLoginLink | token extraction, slash trimming, empty public URL |
| trustHint | missing host warning, host and host:port coverage, invalid URL |
| /remote renders link | command registration, link text, served status |
| /remote warns | trustedHosts self-check in command output |

## Not covered by automated tests

- Real DSH activation through the desktop app (requires a running DSH profile).
- Real `tailscale serve` mapping (requires Tailscale and HTTPS certificates).
- Browser login/cookie flow.

## Manual verification performed

- Installed into a `base + web-app + plugin` profile; app started, plugin logged the
  bootstrap file and executed `tailscale serve --bg --https=443`.
- `https://<MagicDNS>/` returned 401 before login, `/favicon.svg` returned 200;
  token exchange returned 303 and set a 30-day cookie.
- Login link written to `$DSH_HOME/remote-access/url.txt`.
