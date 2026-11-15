# Changelog

## 0.1.0 — 2026-11-15

- Initial release.
- Exposes the local DSH Web UI to a Tailscale tailnet through `tailscale serve`.
- `/remote` shows the authenticated login link; `/remote on|off` toggles the serve mapping.
- Writes the bootstrap link to `$DSH_HOME/remote-access/url.txt`.
- Self-checks `connection.trustedHosts` and prints the host to add when missing.
- Zero runtime dependencies; host-only plugin.
