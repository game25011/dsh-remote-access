# dsh-remote-access

<img src="assets/icon-180.png" width="96" alt="dsh-remote-access icon">

[![CI](https://github.com/game25011/dsh-remote-access/actions/workflows/ci.yml/badge.svg)](https://github.com/game25011/dsh-remote-access/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@game25011/dsh-remote-access.svg)](https://www.npmjs.com/package/@game25011/dsh-remote-access)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Remote-control the local DSH through Tailscale.** The plugin exposes the running **DeepSeek Harness (DSH) Web UI** to your own [Tailscale](https://tailscale.com) tailnet, so a phone or tablet can drive the same sessions, models and permissions as the PC — with a settings page and `/remote` command for the authenticated login link.

- The Web UI keeps binding `127.0.0.1`; the only external door is Tailscale (WireGuard, tailnet-only).
- On activation the plugin reads the local Web UI port, builds the authenticated URL, writes it to `$DSH_HOME/remote-access/url.txt`, and runs `tailscale serve --bg --https=<port> http://127.0.0.1:<web port>`.
- `/remote` prints the login link (with the per-process token). `/remote on` / `/remote off` toggle the Serve mapping.
- A **Settings → 远程访问（Tailscale）** page shows the same link with a copy button, a QR code for the tablet camera, the live Serve status/toggle and the trusted-host self-check.
- Closing the app turns the Serve mapping off.
- No runtime dependencies, no telemetry; the QR encoder is vendored (MIT).

## Prerequisites (must all hold)

1. **The DSH Web UI is available and running** on the PC — the desktop app runs it, or a `dsh web` process does. The plugin attaches to that running Web UI; it does not start one.
2. **The Tailscale link is up on both ends** — Tailscale installed and logged in on the PC and on the phone/tablet, both nodes online in the same tailnet, and the tailnet hostname added to `connection.trustedHosts` (see below).
3. **The personal PC can stay powered on and awake** — the PC is the server: if it shuts down, sleeps, or the DSH app exits, the remote entry stops working.

Also required: DSH `>=0.2.2-rc.0 <0.3.0` (host services `webServer`, `connection`, `commands`), and **HTTPS Certificates enabled** for the tailnet (Tailscale admin → DNS → HTTPS Certificates) when using `--https=443`.

If any prerequisite is missing, `/remote` and the settings page show a readable error instead of failing silently.

## Install

From npm:

```sh
dsh plugin --profile <profile> add @game25011/dsh-remote-access
```

From a local checkout:

```sh
dsh plugin --profile <profile> add /path/to/dsh-remote-access
```

Then restart DSH; profile patches apply at startup.

## Trusted hosts (required)

DSH's browser trust fence only accepts loopback or authorities listed in `connection.trustedHosts`.
The bundle patch reads:

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

```yaml
- id: remote-access-link
  config:
    serve: true          # manage tailscale serve on/off
    servePort: 443       # https port served to the tailnet
    publicUrl: ''        # default: https://<MagicDNS name>/ from tailscale status --json
    tailscalePath: ''    # default: platform autodetect / PATH
    statusTimeoutMs: 5000
```

## Security

- The printed link contains a **process-scoped login token**; treat it like a password.
- Prefer a low default permission preset (e.g. `workspace-write` with approval) for remotely driven sessions.
- Tailscale Funnel is not used and not needed.
- The plugin does not change DSH authentication; the token/cookie flow stays the same.
- See [SECURITY.md](SECURITY.md) for the threat model and reporting.

## Docs

- [Interface contract](docs/INTERFACE.md)
- [Release guide](docs/RELEASING.md)
- [Test report](docs/TEST-REPORT.md)
- [Changelog](CHANGELOG.md)
- [AI disclosure](AI-DISCLOSURE.md)

## Roadmap

- Optional auto-revoke on idle.
- Non-Serve transports (explicit bind + own proxy).

## Development

```sh
node --check index.js
npm test
npm pack --dry-run
```

## Authorship and maintenance

Built by **DeepSeek (DS)** — the plugin's code, tests and docs were produced by a DeepSeek Harness agent. The **human user** is responsible for real-device testing (PC + Tailscale + phone/tablet) and for ongoing maintenance and releases. See [AI-DISCLOSURE.md](AI-DISCLOSURE.md).

## License

MIT — see [LICENSE](LICENSE).

---

# 中文说明

**通过 Tailscale 远程操控本机 DSH**：把本机 **DSH Web UI** 通过 Tailscale Serve 暴露给 tailnet，手机/平板就能像在 PC 上一样使用同一批会话、模型和权限；插件提供设置页与 `/remote` 命令管理登录链接。

- 网页服务仍只绑 `127.0.0.1`，外部入口只有 Tailscale（WireGuard，仅 tailnet 可达）。
- 启动时自动读本机 web 端口，写登录链接到 `$DSH_HOME/remote-access/url.txt`，并执行 `tailscale serve --bg --https=<端口> http://127.0.0.1:<web端口>`。
- `/remote` 显示登录链接；`/remote on` / `/remote off` 开关 Serve 映射；应用退出时关闭映射。
- **设置 → 远程操控（Tailscale）** 页显示链接+复制、二维码（平板扫码）、Serve 状态/开关与信任自检。
- 无运行时依赖、不联网、不调用模型；二维码编码器为 vendored（MIT）。

**使用前提（三条必须同时满足）**：

1. **DSH Web UI 可用且在运行**（桌面应用自带，或 `dsh web` 进程）；插件依附它，不负责启动；
2. **Tailscale 链路打通**（PC 与手机/平板都安装并登录 Tailscale、同 tailnet 在线，且 tailnet 主机名已加入 `connection.trustedHosts`）；
3. **个人 PC 可保持开机与唤醒**（PC 是服务端，关机/睡眠/DSH 退出后远程入口即失效）。

安装：`dsh plugin --profile <profile> add @game25011/dsh-remote-access`，然后重启 DSH。

必需配置：把 tailnet 主机名加进信任栅栏——设 `DSH_REMOTE_TRUSTED_HOSTS=host.tailnet.ts.net`，或在 profile patch 里覆盖 `connection.config.trustedHosts`。

安全：链接含进程级登录 token，等同密码；远程会话建议用低权限档；不启用 Funnel；不改动 DSH 认证实现。详见 [SECURITY.md](SECURITY.md)。