import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../index.js'

/** 最小 fake ctx：执行 effect 生成器并收集它注册的命令。 */
function fakeContext(connection) {
  const registered = []
  const ctx = {
    webServer: { port: 12345, protocol: 'http:' },
    connection,
    effect(fn) {
      const iterator = fn()
      let step = iterator.next()
      while (!step.done) step = iterator.next()
    },
    commands: {
      register(definition) {
        registered.push(definition)
        return () => {}
      },
    },
  }
  return { ctx, registered }
}

test('/remote renders the login link and serves status', async () => {
  const home = mkdtempSync(join(tmpdir(), 'remote-access-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const { ctx, registered } = fakeContext({
      trustedHosts: ['host.tail1234.ts.net'],
      authenticatedUrl: (base) => base + '/?token=test-token',
    })
    apply(ctx, { serve: false, publicUrl: 'https://host.tail1234.ts.net/' })
    assert.equal(registered.length, 1)
    const command = registered[0]
    assert.equal(command.name, 'remote')
    const result = await command.handler({ rawInput: '' })
    assert.equal(result.kind, 'success')
    assert.match(result.text, /https:\/\/host\.tail1234\.ts\.net\/\?token=test-token/)
    assert.doesNotMatch(result.text, /trustedHosts 未包含/)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})

test('/remote warns when the public host is not trusted', async () => {
  const home = mkdtempSync(join(tmpdir(), 'remote-access-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const { ctx, registered } = fakeContext({
      trustedHosts: [],
      authenticatedUrl: (base) => base + '/?token=t',
    })
    apply(ctx, { serve: false, publicUrl: 'https://host.tail1234.ts.net/' })
    const result = await registered[0].handler({ rawInput: 'status' })
    assert.equal(result.kind, 'success')
    assert.match(result.text, /trustedHosts 未包含/)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})
test('rpc status returns the link and QR, unknown endpoints fail', async () => {
  const home = mkdtempSync(join(tmpdir(), 'remote-access-rpc-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    let channel = ''
    let handler = null
    const ctx = {
      webServer: { port: 12345, protocol: 'http:' },
      connection: {
        trustedHosts: ['host.tail1234.ts.net'],
        authenticatedUrl: (base) => base + '/?token=tok',
        rpc: {
          handle(name, fn) {
            channel = name
            handler = fn
            return () => {}
          },
        },
      },
      commands: { register: () => () => {} },
      effect(fn) {
        const iterator = fn()
        let step = iterator.next()
        while (!step.done) step = iterator.next()
      },
    }
    apply(ctx, { serve: false, publicUrl: 'https://host.tail1234.ts.net/' })
    assert.equal(channel, '/dsh-remote-access')
    assert.equal(typeof handler, 'function')
    const status = await handler('status', {})
    assert.equal(status.ok, true)
    assert.match(status.value.link, /token=tok/)
    assert.match(status.value.qrSvg, /^<svg/)
    assert.equal(status.value.serving, false)
    assert.equal(status.value.trusted, true)
    const unknown = await handler('nope', {})
    assert.equal(unknown.ok, false)
    assert.equal(unknown.error.code, 'not-found')
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
  }
})
