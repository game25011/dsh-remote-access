# Changelog

## 0.2.0 — 2026-11-15

- Add the Web Client half: a settings page `远程访问（Tailscale）` showing the login link,
  a copy button, the serve status/toggle and the trusted-host self-check.
- Add a QR code for the login link (vendored MIT `qrcode-generator`, no runtime dependency).
- New Connection RPC channel `/dsh-remote-access` (`status`, `serve`).
- `/remote` command kept; serve state now reflects the actual tailscale result.
- Documented prerequisites (Web UI running, Tailscale link up, PC powered on) and authorship: built by DeepSeek, tested and maintained by the human user.

## 0.1.0 — 2026-11-15

- Initial release.
- Exposes the local DSH Web UI to a Tailscale tailnet through `tailscale serve`.
- `/remote` shows the authenticated login link; `/remote on|off` toggles the serve mapping.
- Writes the bootstrap link to `$DSH_HOME/remote-access/url.txt`.
- Self-checks `connection.trustedHosts` and prints the host to add when missing.
- Zero runtime dependencies; host-only plugin.