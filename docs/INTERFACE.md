# Interface

Host-side DSH plugin (no Web Client half).

## Plugin identity

| Field | Value |
|---|---|
| package | `@game25011/dsh-remote-access` |
| dsh-plugin id | `game25011.dsh.remote-access` |
| enabled by | profile bundle (`dsh.bundle.patch`) |

## Injected services

| Service | Use |
|---|---|
| `commands` | registers the `/remote` command (contract `commands.dsh/v1alpha1`) |
| `webServer` | reads `port` (and `protocol`) of the running Web UI |
| `connection` | `authenticatedUrl(base)` for the process login token; `trustedHosts` for a self-check |

The plugin does not import host packages. It only uses the injected service objects, so a
`link:` install works from the real source directory.

## Command

```text
/remote          show the login link, the public root and the serve status
/remote status   same as /remote
/remote on       (re)create the tailscale serve mapping
/remote off      remove the tailscale serve mapping
```

Result is a standard `CommandResult`: `{ kind: 'success', text }` or `{ kind: 'error', text }`.

## Activation and teardown

1. read `webServer.port`;
2. resolve `tailscale` (config → `DSH_TAILSCALE_PATH` → platform paths → PATH);
3. read `tailscale status --json` once for the MagicDNS name (unless `publicUrl` is configured);
4. build the login link: `https://<MagicDNS>/?token=<process token>`;
5. write `$DSH_HOME/remote-access/url.txt`;
6. if `serve`, run `tailscale serve --bg --https=<servePort> http://127.0.0.1:<port>`;
7. register the command.

On disposal: `tailscale serve --https=<servePort> off`.

## Configuration

```yaml
- id: remote-access-link
  config:
    serve: true
    servePort: 443
    publicUrl: ''          # default: https://<MagicDNS name>/
    tailscalePath: ''      # default: platform autodetect
    statusTimeoutMs: 5000
```

## Browser trust fence

`cordis.patch.yml` overrides `connection.config.trustedHosts`:

```yaml
trustedHosts: !!js (process.env.DSH_REMOTE_TRUSTED_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
```

Set `DSH_REMOTE_TRUSTED_HOSTS`, or override the same row in your own profile patch
(applied after the bundle patch). The DSH browser fence checks Host/Origin before
auth; without the host here the remote page fails with 403.

## Files written

- `$DSH_HOME/remote-access/url.txt` — bootstrap copy of the current login link.

## Failure behavior

- tailscale missing or `serve` fails: the plugin logs the error, keeps the Web UI running,
  and `/remote` still prints the link and the failure status.
- no MagicDNS name and no `publicUrl`: the command prints a configuration warning.
- trusted host missing: the command prints a warning with the exact host to add.
## Client half

The Web Client bundle (`lib/client.js`) is a self-contained browser factory registered through
`window.__ModuleLoader__.load({ id: 'dsh-remote-access', factory })`. It only requires `react`.

- Registers `settings.section` (id `dsh-remote-access`, order 55, label 远程访问) and, on
  DSH 0.2.2+, `settings.section.icon`.
- The page reads the host through `ctx.connection.rpc.call('/dsh-remote-access', endpoint, payload, signal)`.
- Rendering is defensive: a missing `connection.rpc` or a failed call shows an error in the page
  instead of throwing during plugin load.

### RPC endpoints

| endpoint | payload | value |
|---|---|---|
| `status` | `{}` | `{ version, link, publicUrl, qrSvg, servePort, serving, appPort, host, checks, ready }` |
| `serve` | `{ enabled: boolean }` | same shape after applying the toggle; `{ ok:false, error }` on failure |

The `link` and `qrSvg` fields contain the process login token. They are returned only through
the Connection RPC channel, which owns the browser Host/Origin/cookie fence; the page never
writes them to storage or logs.

`checks` is the preflight list (`webui`, `tailscaleRunning`, `online`, `magicDns`,
`trustedHost`, `serveMapped`, `https`); `ready` is true only when the core checks pass.
The channel is registered through `connection.rpc.handle` when available, otherwise through a
`webServer` prefix route that reuses `connection.requestRejection` and the same unary envelope.

## Files written

- `$DSH_HOME/remote-access/url.txt` — bootstrap copy of the current login link.