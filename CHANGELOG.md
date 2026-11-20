# Changelog

## Unreleased

- README: add real-device screenshots (settings preflight checklist, phone viewport over the
  tailnet), a "Why this one" section stating what this plugin does differently, and a long-term
  maintenance and compatibility commitment.
- Re-state authorship as human-led, AI-assisted in README and AI-DISCLOSURE.

## 0.4.2 — 2026-11-16

- Use "手机或平板" in the first-time login copy instead of assuming a tablet.

## 0.4.1 — 2026-11-16

- Polish the settings-page copy: clearer first-time login steps, plain security wording for the
  login credential, and actionable guidance when checks fail.

## 0.4.0 — 2026-11-16

- Add an **end-to-end verification**: the host performs the real login through the tailnet
  (token exchange → browser cookie → WebUI index with `__DSH_BOOT__`) before reporting ready.
- The settings page shows the verification row and its failure reason; link and QR appear only
  when every prerequisite and the end-to-end check pass.

## 0.3.0 — 2026-11-16

- The settings page is now a preflight checklist: Web UI running, Tailscale running, node online,
  MagicDNS name, trusted host, serve mapping, HTTPS. The login link and QR are shown only after
  the core checks pass; "开启 tailnet 入口" and "重新检测" are available in place.
- Fallback Connection-RPC transport via a `webServer` prefix route when
  `connection.rpc.handle` is unavailable; fixes the HTTP 405 on the settings page.
- `parseServeStatus` helper and enriched status payload (`checks`, `ready`).

## 0.2.2 — 2026-11-16

- Fix the client bundle registration id: it must equal the package name
  (`@game25011/dsh-remote-access`), otherwise the shell never instantiates the client module and
  the settings page is missing.

## 0.2.1 — 2026-11-15

- Add a dedicated settings icon (monitor + signal motif) and an explicit "远程操控分支" scope
  declaration on the settings page.
- Add the plugin icon assets (`assets/icon.svg`, `assets/icon-180.png`) for storefronts.

## 0.2.0 — 2026-11-15

- Add the Web Client half: a settings page `远程访问（Tailscale）` showing the login link,
  a copy button, the serve status/toggle and the trusted-host self-check.
- Add a QR code for the login link (vendored MIT `qrcode-generator`, no runtime dependency).
- New Connection RPC channel `/dsh-remote-access` (`status`, `serve`).
- `/remote` command kept; serve state now reflects the actual tailscale result.
- Documented prerequisites (Web UI running, Tailscale link up, PC powered on) and authorship.

## 0.1.0 — 2026-11-15

- Initial release.
- Exposes the local DSH Web UI to a Tailscale tailnet through `tailscale serve`.
- `/remote` shows the authenticated login link; `/remote on|off` toggles the serve mapping.
- Writes the bootstrap link to `$DSH_HOME/remote-access/url.txt`.
- Self-checks `connection.trustedHosts` and prints the host to add when missing.
- Zero runtime dependencies; host-only plugin.
