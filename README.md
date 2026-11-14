# dsh-plugin-remote-access

Expose the local **DeepSeek Harness (DSH) Web UI** to your own [Tailscale](https://tailscale.com) tailnet and get an authenticated login link with a slash command.

- The web server keeps binding `127.0.0.1`; the only external door is Tailscale (WireGuard, tailnet-only).
- On activation the plugin reads the local web port, builds the authenticated URL, writes it to `$DSH_HOME/remote-access/url.txt`, and runs `tailscale serve --bg --https=<port> http://127.0.0.1:<web port>`.
- `/remote` prints the login link (with the per-process token). `/remote on` / `/remote off` toggle the Serve mapping.
- Closing the app turns the Serve mapping off.

## Requirements

- DSH 0.2.2+ (host services `webServer`, `connection`, `commands`).
- Tailscale installed and logged in on the same machine.
- **HTTPS Certificates enabled** for the tailnet (Tailscale admin → DNS → HTTPS Certificates) if you use `--https=443`.

## Install

From a local checkout:

```sh
dsh plugin --profile <profile> add /path/to/dsh-plugin-remote-access
```

Then restart DSH (profile patches apply at startup).

## Trusted hosts (required)

DSH's browser trust fence only accepts loopback or authorities listed in `connection.trustedHosts`.
This plugin's `cordis.patch.yml` reads:

```
DSH_REMOTE_TRUSTED_HOSTS=host.tailnet.ts.net,100.x.y.z
```

or override the row in your own profile patch (applied after the bundle patch):

```yaml
- id: connection
  config:
    trustedHosts:
      - host.tailnet.ts.net
```

`/remote` prints a warning when the public host is missing from `trustedHosts`.

## Configuration

Optional plugin row config (e.g. in your profile patch):

```yaml
- id: remote-access-link
  config:
    serve: true          # manage tailscale serve on/off
    servePort: 443       # https port served to the tailnet
    publicUrl: ''        # default: https://<MagicDNS name>/ from `tailscale status --json`
    tailscalePath: ''    # default: auto-detect per platform / PATH
    statusTimeoutMs: 5000
```

## Security notes

- The printed link contains a **process-scoped login token**; treat it like a password.
- Prefer a low default permission preset (e.g. `workspace-write` with approval) for remotely driven sessions.
- Tailscale Funnel is not used and not needed.
- The plugin does not change DSH authentication; the token/cookie flow stays the same.

## Roadmap

- Client-side settings page showing the link and a QR code.
- Optional auto-revoke on idle.
- Non-Serve transports (e.g. explicit bind + own proxy).

## Development

```sh
node --test test/
```

## License

MIT

---

# 中文说明

把本机 **DSH Web UI** 通过 Tailscale Serve 暴露给 tailnet，并提供 `/remote` 命令输出带 token 的登录链接。

- 网页服务仍只绑 `127.0.0.1`，外部入口只有 Tailscale（WireGuard，仅 tailnet 可达）。
- 启动时自动读本机 web 端口，写登录链接到 `$DSH_HOME/remote-access/url.txt`，并执行 `tailscale serve --bg --https=<端口> http://127.0.0.1:<web端口>`。
- `/remote` 显示登录链接；`/remote on` / `/remote off` 开关 Serve 映射；应用退出时关闭映射。

安装：`dsh plugin --profile <profile> add <本目录>`，然后重启 DSH。

必需配置：把 tailnet 主机名加进信任栅栏——设 `DSH_REMOTE_TRUSTED_HOSTS=host.tailnet.ts.net`，或在 profile patch 里覆盖 `connection.config.trustedHosts`。

安全：链接含进程级登录 token，等同密码；远程会话建议用低权限档；不启用 Funnel；不改动 DSH 认证实现。
