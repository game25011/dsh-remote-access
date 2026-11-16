/**
 * dsh-plugin-remote-access
 *
 * 通过 Tailscale 远程操控本机 DSH：把运行中的 Web UI 暴露给本人 tailnet。
 * 提供：
 * - /remote 命令（链接、启停、自检）
 * - Connection RPC /dsh-remote-access（设置页：条件自检、登录链接、二维码、Serve 开关）
 *
 * 设计边界：
 * - 网页服务仍只绑 loopback；外部入口只有 Tailscale（WireGuard，仅 tailnet）。
 * - 链接与二维码含登录 token，等同凭证，只在本人设备上使用。
 * - 不修改 DSH 认证实现；trustedHosts 由 cordis.patch.yml 注入（见 README）。
 */
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import qrcode from './lib/vendor/qrcode.mjs'

export const name = 'dsh-plugin-remote-access'
export const VERSION = '0.4.0'
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

/** 读一次 tailscale status；失败返回 undefined，不抛出。 */
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

/** 读一次 tailscale serve status 文本；未配置时返回空串。 */
export function readServeStatusText(tailscalePath, timeoutMs) {
  try {
    return execFileSync(tailscalePath, ['serve', 'status'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}

/** 解析 serve status：是否映射到当前 web 端口、是否 https、映射的主机名。 */
export function parseServeStatus(text, appPort) {
  const source = typeof text === 'string' ? text : ''
  const targetPattern = new RegExp('proxy\\s+http://127\\.0\\.0\\.1:' + Number(appPort) + '(?:\\b|$)')
  const httpsMatch = /https:\/\/([A-Za-z0-9._-]+)/.exec(source)
  return {
    mapped: targetPattern.test(source),
    https: httpsMatch !== null,
    host: httpsMatch === null ? '' : httpsMatch[1],
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

function isTrustedHost(connection, host) {
  if (!host) return false
  try {
    const trusted = Array.isArray(connection?.trustedHosts) ? connection.trustedHosts : []
    return trusted.some((entry) => String(entry).split(':')[0].toLowerCase() === host.toLowerCase())
  } catch {
    return false
  }
}

/**
 * 端到端验证：从本机经 Tailscale 公网名做一次真实登录，确认 token 交换、
 * cookie 颁发和 WebUI 加载都成功。带 cookie 的第二次请求证明手机/平板走同一条路也能用。
 * @returns {Promise<{ok:boolean, reason:string, steps:object}>}
 */
export async function verifyRemote(options, fetchImpl) {
  const doFetch = fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined)
  const publicUrl = String(options?.publicUrl || '').replace(/\/+$/, '') + '/'
  const tokenUrl = String(options?.tokenUrl || '')
  const timeoutMs = Number.isFinite(Number(options?.timeoutMs)) && Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 6000
  const steps = { tokenExchange: false, cookieIssued: false, webuiLoad: false }
  if (typeof doFetch !== 'function') return { ok: false, reason: '运行时不支持 fetch，无法做端到端验证。', steps }
  if (!tokenUrl) return { ok: false, reason: '登录地址未生成。', steps }
  const signal = AbortSignal.timeout(timeoutMs)
  let first
  try {
    first = await doFetch(tokenUrl, { redirect: 'manual', signal })
  } catch (error) {
    return { ok: false, reason: '经 Tailscale 访问登录地址失败：' + String(error?.message ?? error), steps }
  }
  if (![302, 303, 307].includes(first.status)) {
    return { ok: false, reason: '登录地址返回 HTTP ' + first.status + '（token 可能已失效或服务未就绪）。', steps }
  }
  steps.tokenExchange = true
  let setCookie = []
  try {
    setCookie = typeof first.headers.getSetCookie === 'function' ? first.headers.getSetCookie() : [first.headers.get('set-cookie')].filter(Boolean)
  } catch {
    setCookie = []
  }
  const cookie = setCookie.length > 0 ? String(setCookie[0]).split(';', 1)[0] : ''
  if (!cookie) return { ok: false, reason: '登录地址未颁发浏览器 cookie（认证流程异常）。', steps }
  steps.cookieIssued = true
  let second
  try {
    second = await doFetch(publicUrl, { headers: cookie ? { cookie } : {}, signal })
  } catch (error) {
    return { ok: false, reason: '用登录 cookie 加载 WebUI 失败：' + String(error?.message ?? error), steps }
  }
  if (!second.ok) return { ok: false, reason: '用登录 cookie 加载 WebUI 返回 HTTP ' + second.status + '。', steps }
  let html = ''
  try { html = await second.text() } catch {}
  if (!html.includes('__DSH_BOOT__') && !html.includes('id="root"')) {
    return { ok: false, reason: 'WebUI 页面内容异常（未找到启动载荷）。', steps }
  }
  steps.webuiLoad = true
  return { ok: true, reason: '', steps }
}

/** 设置页 / RPC 共用的状态载荷；checks 是远程操控的前置条件清单。 */
export function statusPayload(input) {
  const link = typeof input?.link === 'string' ? input.link : ''
  const publicUrl = typeof input?.publicUrl === 'string' ? input.publicUrl : ''
  const checks = input?.checks && typeof input.checks === 'object' ? input.checks : {}
  const normalizedChecks = {
    webui: checks.webui === true,
    tailscaleRunning: checks.tailscaleRunning === true,
    online: checks.online === true,
    magicDns: checks.magicDns === true,
    trustedHost: checks.trustedHost === true,
    serveMapped: checks.serveMapped === true,
    verified: checks.verified === true,
    https: checks.https === true,
  }
  const ready = normalizedChecks.webui && normalizedChecks.tailscaleRunning && normalizedChecks.online
    && normalizedChecks.magicDns && normalizedChecks.trustedHost && normalizedChecks.serveMapped
    && normalizedChecks.verified
  return {
    version: VERSION,
    link,
    publicUrl,
    qrSvg: typeof input?.qrSvg === 'string' ? input.qrSvg : '',
    servePort: input?.servePort,
    serving: input?.serving === true,
    appPort: input?.appPort,
    host: typeof input?.host === 'string' ? input.host : '',
    checks: normalizedChecks,
    verifyReason: typeof input?.verifyReason === 'string' ? input.verifyReason : '',
    ready,
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

// ---- Fallback Connection-RPC transport (used when connection.rpc.handle is unavailable) ----

function sendRpcResponse(res, rpcId, result) {
  const body = JSON.stringify({ type: 'server-response', rpcId, result })
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

function rpcFailure(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

function readJsonBody(req, limit) {
  return new Promise((resolve) => {
    let size = 0
    let settled = false
    const chunks = []
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    try {
      req.on('data', (chunk) => {
        if (settled) return
        size += chunk.length
        if (size > limit) {
          finish({ ok: false, status: 413, message: 'request body too large' })
          try { req.destroy() } catch {}
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => {
        if (settled) return
        if (size === 0) { finish({ ok: false, status: 400, message: 'empty request body' }); return }
        try { finish({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }) }
        catch { finish({ ok: false, status: 400, message: 'body is not JSON' }) }
      })
      req.on('error', () => finish({ ok: false, status: 400, message: 'request stream failed' }))
    } catch {
      finish({ ok: false, status: 400, message: 'request stream failed' })
    }
  })
}

function endpointFromUrl(channel, pathname) {
  const prefix = channel + '/'
  if (typeof pathname !== 'string' || !pathname.startsWith(prefix)) return undefined
  const endpoint = pathname.slice(prefix.length)
  if (!/^[A-Za-z0-9_~.-]+(?:\/[A-Za-z0-9_~.-]+)*$/.test(endpoint)) return undefined
  return endpoint
}

/**
 * Register the RPC channel. Preferred: connection.rpc.handle. Fallback: a webServer
 * prefix route reusing connection.requestRejection and the official unary envelope.
 * @returns {{mode: 'channel'|'route'|'failed', dispose: () => void}}
 */
function installRpc(ctx, connection, webServer, channel, handler, log) {
  try {
    const rpc = connection && connection.rpc
    if (rpc && typeof rpc.handle === 'function') {
      const registration = rpc.handle(channel, handler)
      log('rpc channel registered via connection.rpc.handle')
      return {
        mode: 'channel',
        dispose: () => { try { if (typeof registration === 'function') Promise.resolve(registration()).catch(() => {}) } catch {} },
      }
    }
    log('connection.rpc.handle unavailable; using webServer route fallback')
  } catch (error) {
    log('connection.rpc.handle failed; using webServer route fallback: ' + (error?.message ?? error))
  }
  try {
    const dispose = webServer.register({
      kind: 'prefix',
      path: channel,
      handler: async (req, res) => {
        try {
          let rejection
          try {
            rejection = typeof connection.requestRejection === 'function' ? connection.requestRejection(req) : 403
          } catch {
            rejection = 403
          }
          if (rejection !== undefined && rejection !== null) {
            res.statusCode = rejection
            res.setHeader('cache-control', 'no-store')
            res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
            return
          }
          let pathname = '/'
          try { pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname } catch {}
          const endpoint = endpointFromUrl(channel, pathname)
          if (endpoint === undefined) { res.statusCode = 404; res.end('not found'); return }
          if (req.method !== 'POST') { res.statusCode = 405; res.setHeader('allow', 'POST'); res.end(); return }
          const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
          if (contentType !== 'application/json') { res.statusCode = 415; res.end('content type must be application/json'); return }
          const body = await readJsonBody(req, 1024 * 1024)
          if (!body.ok) { res.statusCode = body.status; res.end(body.message); return }
          const message = body.value
          if (!message || typeof message !== 'object' || message.type !== 'client-request'
            || typeof message.rpcId !== 'string' || typeof message.method !== 'string') {
            res.statusCode = 400
            res.end('invalid client-request message')
            return
          }
          if (message.method !== endpoint) {
            sendRpcResponse(res, message.rpcId, rpcFailure('gateway/bad-request', 'method does not match endpoint'))
            return
          }
          let result
          try {
            result = await handler(endpoint, message.payload === undefined ? null : message.payload)
          } catch (error) {
            result = rpcFailure('internal-error', String(error?.message ?? error))
          }
          if (!res.writableEnded) sendRpcResponse(res, message.rpcId, result)
        } catch {
          if (!res.writableEnded) { res.statusCode = 500; res.end('handler failure') }
        }
      },
    })
    log('rpc channel registered via webServer route fallback')
    return { mode: 'route', dispose: () => { try { if (typeof dispose === 'function') dispose() } catch {} } }
  } catch (error) {
    log('rpc route fallback failed: ' + (error?.message ?? error))
    return { mode: 'failed', dispose: () => {} }
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

    const initialStatus = readTailscaleStatus(tailscalePath, config.statusTimeoutMs)
    const publicUrl = () => config.publicUrl || derivePublicUrl(initialStatus)
    const link = () => buildLoginLink(publicUrl(), connection.authenticatedUrl('http://127.0.0.1:' + appPort))

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
      if (ok) serving = false
      return ok
    }
    if (serving) enable()
    yield () => disable()

    /** 每次调用都重新采集条件并做端到端验证，避免设置页显示过期状态。 */
    const collect = async () => {
      const tsStatus = readTailscaleStatus(tailscalePath, config.statusTimeoutMs)
      const dnsName = typeof tsStatus?.Self?.DNSName === 'string' && tsStatus.Self.DNSName.length > 0
        ? tsStatus.Self.DNSName.replace(/\.+$/, '')
        : ''
      const backendRunning = tsStatus?.BackendState === 'Running'
      const online = tsStatus?.Self?.Online === true || (tsStatus?.Self?.Online === undefined && backendRunning)
      const freshPublicUrl = config.publicUrl || derivePublicUrl(tsStatus)
      const host = (() => { try { return new URL(freshPublicUrl).hostname } catch { return dnsName } })()
      const serveStatus = parseServeStatus(readServeStatusText(tailscalePath, config.statusTimeoutMs), appPort)
      const linkText = buildLoginLink(freshPublicUrl, connection.authenticatedUrl('http://127.0.0.1:' + appPort))
      const hint = trustHint(connection, freshPublicUrl)
      const baseChecks = {
        webui: true,
        tailscaleRunning: backendRunning,
        online,
        magicDns: dnsName.length > 0,
        trustedHost: isTrustedHost(connection, host),
        serveMapped: serveStatus.mapped,
        https: serveStatus.https,
      }
      const coreReady = baseChecks.webui && baseChecks.tailscaleRunning && baseChecks.online
        && baseChecks.magicDns && baseChecks.trustedHost && baseChecks.serveMapped
      let verified = false
      let verifyReason = '前置条件未满足，已跳过端到端验证。'
      if (coreReady) {
        const result = await verifyRemote({ publicUrl: freshPublicUrl, tokenUrl: linkText, timeoutMs: config.statusTimeoutMs })
        verified = result.ok
        verifyReason = result.ok ? '' : result.reason
      }
      return statusPayload({
        link: linkText,
        publicUrl: freshPublicUrl,
        qrSvg: buildQrSvg(linkText),
        servePort: config.servePort,
        serving,
        appPort,
        host,
        checks: Object.assign({}, baseChecks, { verified }),
        verifyReason,
        hint,
      })
    }

    const handleRpc = async (endpoint, payload) => {
      if (endpoint === 'status') return { ok: true, value: await collect() }
      if (endpoint === 'serve') {
        const enabled = payload?.enabled === true
        try {
          const ok = enabled ? await enable() : await disable()
          if (!ok) return rpcFailure('serve-failed', 'tailscale serve failed; see app log')
          return { ok: true, value: await collect() }
        } catch (error) {
          return rpcFailure('serve-failed', String(error?.message ?? error))
        }
      }
      return rpcFailure('not-found', 'unknown endpoint: ' + String(endpoint))
    }

    const rpc = installRpc(ctx, connection, webServer, RPC_CHANNEL, handleRpc, log)
    if (rpc.mode !== 'failed') yield () => rpc.dispose()

    // ---- /remote command ----
    yield ctx.commands.register({
      name: 'remote',
      description: 'Show or toggle the Tailscale remote Web UI link',
      handler: async (invocation) => {
        const arg = String(invocation?.rawInput ?? '').trim().toLowerCase()
        if (arg === '' || arg === 'show' || arg === 'status') {
          const current = await collect()
          const lines = [
            '远程操控（Tailscale）',
            '',
            current.ready ? '条件自检：通过' : '条件自检：未通过',
            '  Web UI 运行中: ' + (current.checks.webui ? '是' : '否'),
            '  Tailscale 运行: ' + (current.checks.tailscaleRunning ? '是' : '否'),
            '  本机在线: ' + (current.checks.online ? '是' : '否'),
            '  MagicDNS: ' + (current.checks.magicDns ? '是' : '否'),
            '  信任栅栏: ' + (current.checks.trustedHost ? '是' : '否'),
            '  serve 映射: ' + (current.checks.serveMapped ? '是' : '否'),
            '  HTTPS: ' + (current.checks.https ? '是' : '否'),
            '',
            current.link,
            '',
            '首次打开带 token 的链接；之后 30 天直接打开：',
            current.publicUrl || '(未配置)',
          ]
          const hint = trustHint(connection, publicUrl())
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