/**
 * dsh-plugin-remote-access
 *
 * 把当前 DSH Web UI 通过 Tailscale Serve 暴露给 tailnet，并提供：
 * - /remote 命令：显示带进程 token 的登录链接、启停 Serve、信任栅栏自检；
 * - Connection RPC 通道 /dsh-remote-access：给设置页提供状态、链接、二维码与开关。
 *
 * 设计边界：
 * - 网页服务仍只绑 loopback；对外入口只有 Tailscale（WireGuard，仅 tailnet）。
 * - token 只在本人设备上使用；链接与二维码等同登录凭证。
 * - 不修改 DSH 认证实现；trustedHosts 由 cordis.patch.yml 注入（见 README）。
 */
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import qrcode from './lib/vendor/qrcode.mjs'

export const name = 'dsh-plugin-remote-access'
export const VERSION = '0.2.2'
export const inject = ['commands', 'webServer', 'connection']
export const RPC_CHANNEL = '/dsh-remote-access'

export const DEFAULTS = {
  serve: true,
  servePort: 443,
  publicUrl: '',
  tailscalePath: '',
  statusTimeoutMs: 5000,
}

export function effectiveConfig(raw) {
  const merged = { ...DEFAULTS, ...(raw ?? {}) }
  const servePort = Number(merged.servePort)
  const statusTimeoutMs = Number(merged.statusTimeoutMs)
  return {
    serve: merged.serve !== false,
    servePort: Number.isFinite(servePort) && servePort > 0 ? servePort : DEFAULTS.servePort,
    publicUrl: String(merged.publicUrl || '').trim(),
    tailscalePath: String(merged.tailscalePath || '').trim(),
    statusTimeoutMs: Number.isFinite(statusTimeoutMs) && statusTimeoutMs > 0 ? statusTimeoutMs : DEFAULTS.statusTimeoutMs,
  }
}

/** 按平台与配置解析 tailscale 可执行文件；找不到时返回 'tailscale' 交给 PATH。 */
export function resolveTailscalePath(configured) {
  const candidates = [
    configured,
    process.env.DSH_TAILSCALE_PATH,
    'C:/Program Files/Tailscale/tailscale.exe',
    'C:/Program Files (x86)/Tailscale/tailscale.exe',
    '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
    '/usr/bin/tailscale',
    '/usr/local/bin/tailscale',
    '/opt/homebrew/bin/tailscale',
  ].filter((value) => typeof value === 'string' && value.length > 0)
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate
    } catch {}
  }
  return 'tailscale'
}

/** 从 tailscale status --json 里取本机 MagicDNS 名，拼出默认公网前缀。 */
export function derivePublicUrl(status) {
  const dnsName = status?.Self?.DNSName
  if (typeof dnsName !== 'string' || dnsName.length === 0) return ''
  return 'https://' + dnsName.replace(/\.+$/, '') + '/'
}

/** 用宿主给出的 authenticatedUrl 里的 token 拼出 tailnet 可用的登录链接。 */
export function buildLoginLink(publicUrl, authUrl) {
  const root = String(publicUrl || '').replace(/\/+$/, '') + '/'
  try {
    const token = new URL(authUrl).searchParams.get('token')
    if (!token) return root
    return root + '?token=' + encodeURIComponent(token)
  } catch {
    return root
  }
}

/** 登录链接的二维码（内联 SVG）；失败时返回空串，设置页会隐藏图片。 */
export function buildQrSvg(text) {
  if (typeof text !== 'string' || text.length === 0) return ''
  try {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  } catch {
    return ''
  }
}

/** 读一次 tailscale 状态；失败返回 undefined，不抛出。 */
export function readTailscaleStatus(tailscalePath, timeoutMs) {
  try {
    const stdout = execFileSync(tailscalePath, ['status', '--json'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(stdout)
  } catch {
    return undefined
  }
}

function runTailscale(tailscalePath, args, log) {
  return new Promise((resolve) => {
    try {
      execFile(tailscalePath, args, { windowsHide: true }, (error, _stdout, stderr) => {
        if (error) log('tailscale ' + args.join(' ') + ' failed: ' + (stderr || error.message))
        else log('tailscale ' + args.join(' '))
        resolve(!error)
      })
    } catch (error) {
      log('tailscale spawn failed: ' + (error?.message ?? error))
      resolve(false)
    }
  })
}

function writeBootstrapFile(link, log) {
  try {
    const dir = join(process.env.DSH_HOME || '.', 'remote-access')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'url.txt'), link + '\n', 'utf8')
  } catch (error) {
    log('bootstrap file failed: ' + (error?.message ?? error))
  }
}

/** 自检：connection 的 trustedHosts 是否包含公网主机名。 */
export function trustHint(connection, publicUrl) {
  try {
    const host = new URL(publicUrl).hostname
    const trusted = Array.isArray(connection?.trustedHosts) ? connection.trustedHosts : []
    const covered = trusted.some((entry) => String(entry).split(':')[0].toLowerCase() === host.toLowerCase())
    if (covered) return ''
    return '提示：connection.trustedHosts 未包含 ' + host + '，远程页面会被 403 拒绝；在 profile 的 cordis.patch.yml 里补上（见 README）。'
  } catch {
    return ''
  }
}

/** 设置页 / RPC 共用的状态载荷；不含任何不是登录凭证之外的信息。 */
export function statusPayload({ link, publicUrl, qrSvg, servePort, serving, appPort, trusted }) {
  return {
    version: VERSION,
    link: typeof link === 'string' ? link : '',
    publicUrl: typeof publicUrl === 'string' ? publicUrl : '',
    qrSvg: typeof qrSvg === 'string' ? qrSvg : '',
    servePort,
    serving: serving === true,
    appPort,
    trusted: trusted === true,
  }
}

export function apply(ctx, rawConfig) {
  const config = effectiveConfig(rawConfig)
  const log = (text) => console.log('[remote-access] ' + text)
  ctx.effect(function* () {
    const webServer = ctx.webServer
    const connection = ctx.connection
    const appPort = webServer.port
    const tailscalePath = resolveTailscalePath(config.tailscalePath)

    const status = readTailscaleStatus(tailscalePath, config.statusTimeoutMs)
    const publicUrl = config.publicUrl || derivePublicUrl(status)
    if (!publicUrl) log('no public URL: set publicUrl or make sure tailscale is running')

    const link = () => buildLoginLink(publicUrl, connection.authenticatedUrl('http://127.0.0.1:' + appPort))
    const makeStatus = () => statusPayload({
      link: link(),
      publicUrl,
      qrSvg: buildQrSvg(link()),
      servePort: config.servePort,
      serving,
      appPort,
      trusted: trustHint(connection, publicUrl) === '',
    })

    writeBootstrapFile(link(), log)
    log('login link written to $DSH_HOME/remote-access/url.txt (port ' + appPort + ')')

    let serving = config.serve
    const enable = async () => {
      const ok = await runTailscale(tailscalePath, ['serve', '--bg', '--https=' + config.servePort, 'http://127.0.0.1:' + appPort], log)
      serving = ok
      return ok
    }
    const disable = async () => {
      const ok = await runTailscale(tailscalePath, ['serve', '--https=' + config.servePort, 'off'], log)
      serving = ok ? false : serving
      return ok
    }
    if (serving) enable()
    yield () => disable()

    // ---- Connection RPC channel for the settings page ----
    try {
      const rpc = connection && connection.rpc
      if (rpc && typeof rpc.handle === 'function') {
        const registration = rpc.handle(RPC_CHANNEL, async (endpoint, payload) => {
          if (endpoint === 'status') return { ok: true, value: makeStatus() }
          if (endpoint === 'serve') {
            const enabled = payload?.enabled === true
            try {
              const ok = enabled ? await enable() : await disable()
              if (!ok) return { ok: false, error: { code: 'serve-failed', message: 'tailscale serve failed; see app log' } }
              return { ok: true, value: makeStatus() }
            } catch (error) {
              return { ok: false, error: { code: 'serve-failed', message: String(error?.message ?? error) } }
            }
          }
          return { ok: false, error: { code: 'not-found', message: 'unknown endpoint: ' + String(endpoint) } }
        })
        yield () => {
          try {
            if (typeof registration === 'function') Promise.resolve(registration()).catch(() => {})
          } catch {}
        }
      } else {
        log('connection.rpc.handle unavailable; the settings page will report it')
      }
    } catch (error) {
      log('rpc channel registration failed: ' + (error?.message ?? error))
    }

    // ---- /remote command ----
    yield ctx.commands.register({
      name: 'remote',
      description: 'Show or toggle the Tailscale remote Web UI link',
      handler: async (invocation) => {
        const arg = String(invocation?.rawInput ?? '').trim().toLowerCase()
        if (arg === '' || arg === 'show' || arg === 'status') {
          const current = makeStatus()
          const lines = [
            '远程 Web UI（Tailscale，仅 tailnet 可达）',
            '',
            current.link,
            '',
            '首次打开带 token 的链接；之后 30 天直接打开：',
            publicUrl || '(未配置)',
            'tailscale serve: ' + (current.serving ? '--https=' + config.servePort + ' -> 127.0.0.1:' + appPort : 'off'),
          ]
          const hint = trustHint(connection, publicUrl)
          if (hint) lines.push('', hint)
          return { kind: 'success', text: lines.join('\n') }
        }
        if (arg === 'on') {
          const ok = await enable()
          return ok
            ? { kind: 'success', text: 'tailscale serve 已开启。' }
            : { kind: 'error', text: 'tailscale serve 开启失败，请查看应用日志。' }
        }
        if (arg === 'off') {
          await disable()
          return { kind: 'success', text: 'tailscale serve 已关闭；本机网页仍可用，tailnet 入口不可达。' }
        }
        return { kind: 'error', text: '用法：/remote、/remote on、/remote off' }
      },
    })
  }, 'dsh-plugin-remote-access lifecycle')
}