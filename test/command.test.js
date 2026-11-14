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
