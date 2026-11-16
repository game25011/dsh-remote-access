/**
 * dsh-plugin-remote-access — Client half (browser bundle).
 *
 * 通过 window.__ModuleLoader__ 注册一个设置页「远程访问」：
 * - 读取 Host 的 Connection RPC（/dsh-remote-access）状态与登录链接；
 * - 显示带 token 的链接、二维码、Serve 开关和信任栅栏自检；
 * - 只使用 require('react')，不依赖其它外部包。
 */
;(function loadClientBundle() {
  const loader = typeof window !== 'undefined' && window ? window.__ModuleLoader__ : undefined
  if (!loader || typeof loader.load !== 'function') return
  try {
    loader.load({
      id: '@game25011/dsh-remote-access',
      factory(require) {
        const React = require('react')
        const h = React.createElement
        const useState = React.useState
        const useEffect = React.useEffect
        const useCallback = React.useCallback

        const PKG_ID = 'dsh-remote-access'
        const CHANNEL = '/dsh-remote-access'
        const VERSION = '0.2.2'

        /** apply() 注入的客户端 ctx；设置页组件通过它调用 Connection RPC。 */
        let pluginCtx = null

        const styles = {
          page: { display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '760px' },
          header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
          headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
          headerIcon: {
            display: 'inline-flex',
            width: '42px',
            height: '42px',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
            borderRadius: '12px',
            border: '1px solid rgba(127,127,127,.28)',
            background: 'rgba(127,127,127,.10)',
            color: 'inherit',
          },
          title: { margin: 0, fontSize: '16px', fontWeight: 600 },
          subtitle: { margin: '2px 0 0', opacity: 0.7, fontSize: '13px' },
          version: { opacity: 0.55, fontSize: '12px' },
          muted: { margin: 0, opacity: 0.72, fontSize: '13px', lineHeight: 1.6 },
          branch: {
            border: '1px solid rgba(127,127,127,.3)',
            borderRadius: '10px',
            padding: '12px 14px',
            background: 'rgba(127,127,127,.06)',
          },
          branchTitle: { fontSize: '13px', fontWeight: 600, marginBottom: '4px' },
          branchText: { margin: 0, opacity: 0.72, fontSize: '13px', lineHeight: 1.6 },
          card: {
            border: '1px solid rgba(127,127,127,.3)',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          },
          row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', fontSize: '13px' },
          label: { opacity: 0.7 },
          value: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: '12px', wordBreak: 'break-all' },
          ok: { color: '#1a7f37' },
          bad: { color: '#b35900' },
          linkBox: { display: 'flex', gap: '8px', alignItems: 'stretch' },
          link: {
            flex: 1,
            minWidth: 0,
            padding: '8px 10px',
            border: '1px solid rgba(127,127,127,.3)',
            borderRadius: '8px',
            background: 'rgba(127,127,127,.08)',
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontSize: '12px',
            wordBreak: 'break-all',
            userSelect: 'all',
          },
          button: {
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(127,127,127,.4)',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '13px',
            whiteSpace: 'nowrap',
          },
          buttonPrimary: { borderColor: 'rgba(64,128,255,.6)' },
          error: { color: '#c62828', fontSize: '13px', whiteSpace: 'pre-wrap' },
          qrWrap: { display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' },
          qr: { width: '200px', height: '200px', background: '#fff', borderRadius: '8px', padding: '6px' },
          note: { opacity: 0.6, fontSize: '12px', lineHeight: 1.5 },
        }

        function describeError(error) {
          if (error && typeof error === 'object') {
            if (typeof error.message === 'string' && error.message.length > 0) return error.message
            if (typeof error.code === 'string') return error.code
          }
          return String(error)
        }

        function rpcCall(endpoint, payload, signal) {
          return new Promise((resolve, reject) => {
            try {
              const connection = pluginCtx && pluginCtx.connection
              const service = connection && connection.rpc
              if (!service || typeof service.call !== 'function') {
                reject(new Error('connection.rpc 不可用（DSH 版本或连接层未就绪）'))
                return
              }
              Promise.resolve(service.call(CHANNEL, endpoint, payload || {}, signal)).then((value) => {
                if (value && typeof value.ok === 'boolean') resolve(value)
                else resolve({ ok: true, value })
              }, reject)
            } catch (error) {
              reject(error)
            }
          })
        }

        function StatusRow(props) {
          return h(
            'div',
            { style: styles.row },
            h('span', { style: styles.label }, props.label),
            h('span', { style: props.tone === 'ok' ? styles.ok : props.tone === 'bad' ? styles.bad : styles.value }, props.value),
          )
        }

        function SettingsView() {
          const [status, setStatus] = useState(null)
          const [error, setError] = useState('')
          const [loading, setLoading] = useState(true)
          const [busy, setBusy] = useState(false)
          const [copied, setCopied] = useState(false)

          const load = useCallback(async () => {
            setLoading(true)
            setError('')
            try {
              const result = await rpcCall('status', {})
              if (!result.ok) throw new Error(describeError(result.error))
              setStatus(result.value)
            } catch (loadError) {
              setError(describeError(loadError))
            } finally {
              setLoading(false)
            }
          }, [])

          useEffect(() => {
            load()
          }, [load])

          const copy = useCallback(async () => {
            if (!status || typeof status.link !== 'string' || status.link.length === 0) return
            try {
              await navigator.clipboard.writeText(status.link)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch (copyError) {
              setError('复制失败：' + describeError(copyError))
            }
          }, [status])

          const toggle = useCallback(async () => {
            if (!status || busy) return
            setBusy(true)
            setError('')
            try {
              const result = await rpcCall('serve', { enabled: !status.serving })
              if (!result.ok) throw new Error(describeError(result.error))
              setStatus(result.value)
            } catch (toggleError) {
              setError(describeError(toggleError))
            } finally {
              setBusy(false)
            }
          }, [status, busy])

          const qrDataUrl = status && typeof status.qrSvg === 'string' && status.qrSvg.length > 0
            ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(status.qrSvg)
            : ''

          return h(
            'section',
            { style: styles.page },
            h(
              'div',
              { style: styles.header },
              h(
                'div',
                { style: styles.headerLeft },
                h('span', { style: styles.headerIcon }, h(SettingsNavIcon, { size: 26 })),
                h(
                  'div',
                  null,
                  h('h2', { style: styles.title }, '远程操控（Tailscale）'),
                  h('p', { style: styles.subtitle }, '通过 Tailscale 远程操控本机 DSH'),
                ),
              ),
              h('span', { style: styles.version }, 'v' + VERSION),
            ),
            h(
              'div',
              { style: styles.branch },
              h('div', { style: styles.branchTitle }, '远程操控分支'),
              h(
                'p',
                { style: styles.branchText },
                '本页只管理远程入口：登录链接、二维码、Serve 开关与信任自检。模型、思考强度、权限与工具审批仍在各自的会话设置与设置分支中调整。网页服务始终只绑 127.0.0.1，外部入口仅经 Tailscale（WireGuard）。前提：Web UI 在运行、Tailscale 两端在线、PC 保持开机唤醒。',
              ),
            ),
            error ? h('div', { style: styles.error }, error) : null,
            loading
              ? h('p', { style: styles.muted }, '正在读取远程访问状态…')
              : status
                ? h(
                    React.Fragment,
                    null,
                    h(
                      'div',
                      { style: styles.card },
                      h(StatusRow, {
                        label: 'Serve 映射',
                        value: status.serving ? '已开启（--https=' + status.servePort + '）' : '已关闭',
                        tone: status.serving ? 'ok' : 'bad',
                      }),
                      h(StatusRow, { label: '本机网页端口', value: '127.0.0.1:' + status.appPort }),
                      h(StatusRow, {
                        label: '信任栅栏',
                        value: status.trusted ? '已包含当前 tailnet 主机名' : '未包含，远程会 403（见下方提示）',
                        tone: status.trusted ? 'ok' : 'bad',
                      }),
                      h(
                        'div',
                        { style: styles.linkBox },
                        h('code', { style: styles.link }, status.link || '(未生成)'),
                        h('button', { type: 'button', style: styles.buttonPrimary, onClick: copy, disabled: !status.link }, copied ? '已复制' : '复制'),
                      ),
                      h(
                        'div',
                        { style: { display: 'flex', gap: '8px' } },
                        h(
                          'button',
                          { type: 'button', style: Object.assign({}, styles.button, styles.buttonPrimary), onClick: toggle, disabled: busy },
                          busy ? '处理中…' : status.serving ? '关闭 tailnet 入口' : '开启 tailnet 入口',
                        ),
                        h('button', { type: 'button', style: styles.button, onClick: load, disabled: busy }, '刷新'),
                      ),
                    ),
                    qrDataUrl
                      ? h(
                          'div',
                          { style: styles.card },
                          h('strong', { style: { fontSize: '13px' } }, '扫码登录'),
                          h(
                            'div',
                            { style: styles.qrWrap },
                            h('img', { src: qrDataUrl, alt: '远程登录二维码', style: styles.qr }),
                            h(
                              'p',
                              { style: styles.note },
                              '平板打开 Tailscale 后用相机扫码，会带着当前进程的登录 token 打开；一次登录后 30 天内直接访问干净地址即可。',
                            ),
                          ),
                        )
                      : null,
                    h('p', { style: styles.note }, '链接和二维码含登录 token，等同密码；只在自己设备上使用。进程重启后 token 会更新，设置页刷新即可拿到新链接。'),
                  )
                : null,
          )
        }

        function SettingsNavIcon(props) {
          const size = props && Number.isFinite(props.size) && props.size > 0 ? props.size : 16
          return h(
            'svg',
            { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', style: { display: 'block' } },
            h('rect', { x: 1.2, y: 3.2, width: 7.6, height: 6.2, rx: 1.2, stroke: 'currentColor', strokeWidth: 1.25 }),
            h('path', { d: 'M5 9.4v1.5M3.6 10.9h2.8', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }),
            h('path', { d: 'M10.2 5.2a2.6 2.6 0 0 1 0 4M12 3.4a4.3 4.3 0 0 1 0 7.6', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }),
          )
        }

        function registerSettings(ctx) {
          if (!ctx || !ctx.slots || typeof ctx.slots.inject !== 'function' || typeof ctx.slots.register !== 'function') {
            console.warn('[dsh-remote-access] slots service unavailable; settings page not registered')
            return
          }
          try {
            ctx.slots.inject('settings.section', () => {
              try {
                return ctx.slots.register(
                  { name: 'settings.section', id: PKG_ID, order: 55, label: () => '远程操控' },
                  SettingsView,
                )
              } catch (error) {
                console.warn('[dsh-remote-access] settings.section registration failed:', error)
                return () => {}
              }
            })
          } catch (error) {
            console.warn('[dsh-remote-access] cannot wait for settings.section:', error)
          }
          try {
            ctx.slots.inject('settings.section.icon', () => {
              try {
                return ctx.slots.register({ name: 'settings.section.icon', id: PKG_ID }, SettingsNavIcon)
              } catch (error) {
                return () => {}
              }
            })
          } catch (error) {
            // Older shells have no native icon slot; the default gear is fine.
          }
        }

        function apply(ctx) {
          pluginCtx = ctx
          registerSettings(ctx)
        }

        const exportsObject = { inject: ['slots', 'connection'], apply }
        try {
          Object.defineProperty(exportsObject, '__test', {
            enumerable: false,
            value: { PKG_ID, CHANNEL, VERSION, describeError },
          })
        } catch {}
        return exportsObject
      },
    })
  } catch (error) {
    try {
      console.warn('[dsh-remote-access] client bundle load failed:', error)
    } catch {}
  }
})()