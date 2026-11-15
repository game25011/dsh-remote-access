# Test report

- Date: 2026-11-15
- Environment: Windows 11, Node.js v24.19.0
- Command: `npm test` (three files)
- Result: 11 passed / 0 failed

| Test | Covers |
|---|---|
| effectiveConfig | defaults, string coercion, `serve: false` |
| derivePublicUrl | MagicDNS name parsing, missing name |
| buildLoginLink | token extraction, slash trimming, empty public URL |
| buildQrSvg | SVG output for a login link, empty input |
| statusPayload | RPC value shape, defensive defaults |
| trustHint | missing host warning, host and host:port coverage, invalid URL |
| /remote renders link | command registration, link text, served status |
| /remote warns | trustedHosts self-check in command output |
| client bundle registers | module-loader id, settings.section + icon registration |
| client describeError | error message/code/string handling |
| rpc status | status link/QR, unknown endpoint failure |

## Not covered by automated tests

- Real DSH activation of the client page in a browser (requires a running desktop app).
- Real `tailscale serve` mapping (requires Tailscale and HTTPS certificates).
- Browser login/cookie flow.

## Manual verification performed (0.1.0)

- Installed into a `base + web-app + plugin` profile; app started, plugin logged the
  bootstrap file and executed `tailscale serve --bg --https=443`.
- `https://<MagicDNS>/` returned 401 before login, `/favicon.svg` returned 200;
  token exchange returned 303 and set a 30-day cookie.
- Login link written to `$DSH_HOME/remote-access/url.txt`.

## Pending manual verification (0.2.0)

- Open the settings page in the desktop app, copy the link and scan the QR from a tablet.
- Toggle Serve off/on from the page and confirm the tailnet entry follows.