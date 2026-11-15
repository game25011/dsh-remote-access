# Security policy

## Supported versions

The latest `0.1.x` release receives fixes.

## Reporting

Do not open a public issue for vulnerabilities. Use GitHub Security Advisories:

```text
https://github.com/game25011/dsh-remote-access/security/advisories/new
```

Include the plugin version, DSH version, OS, steps to reproduce and logs with tokens, cookies
and personal paths removed.

## Scope

- **Login token exposure.** `/remote` prints a process-scoped token; `$DSH_HOME/remote-access/url.txt`
  stores it on disk. Anyone who obtains the token and can reach the tailnet host can log in.
  Unexpected disclosure (logs, crash reports, public issues, telemetry) is in scope.
- **Browser trust fence.** The plugin adds hosts to `connection.trustedHosts` via its bundle
  patch. A bypass that admits untrusted Host/Origin values is in scope.
- **Serve mapping.** The plugin runs the local `tailscale` CLI. Command injection through
  configuration values is in scope.
- **Network boundary.** The plugin itself makes no outbound requests, collects no telemetry and
  calls no model. The Web UI stays bound to `127.0.0.1`; Tailscale is the only external door.
  Tailscale Funnel is not used.
- **Permission preset.** The plugin does not change session permissions; deployments should use
  a low default preset (e.g. `workspace-write`) for remotely driven sessions.

## Dependency note

Tailscale, its daemon and TLS certificates are external dependencies with their own security
model. Keep the tailnet ACLs and device list under your control.
