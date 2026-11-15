import { test } from 'node:test'
import assert from 'node:assert/strict'

let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition
    },
  },
}

const fakeReact = {
  Fragment: 'Fragment',
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
}

await import('../lib/client.js')

test('client bundle registers the settings section', () => {
  assert.ok(captured, 'module loader captured the bundle')
  assert.equal(captured.id, 'dsh-remote-access')
  const exportsObject = captured.factory((id) => {
    if (id === 'react') return fakeReact
    throw new Error('unexpected require: ' + id)
  })
  assert.equal(typeof exportsObject.apply, 'function')
  assert.deepEqual(exportsObject.inject, ['slots', 'connection'])

  const registrations = []
  const ctx = {
    slots: {
      inject(name, factory) {
        factory()
      },
      register(definition, component) {
        registrations.push({ definition, component })
        return () => {}
      },
    },
    connection: {
      rpc: {
        async call() {
          return { ok: true, value: {} }
        },
      },
    },
  }
  exportsObject.apply(ctx)
  assert.equal(registrations.length, 2, 'settings section + nav icon')
  assert.equal(registrations[0].definition.name, 'settings.section')
  assert.equal(registrations[0].definition.id, 'dsh-remote-access')
  assert.equal(typeof registrations[0].component, 'function')
  assert.equal(registrations[1].definition.name, 'settings.section.icon')
})

test('client describeError is defensive', () => {
  const exportsObject = captured.factory((id) => fakeReact)
  const describeError = exportsObject.__test.describeError
  assert.equal(describeError(new Error('boom')), 'boom')
  assert.equal(describeError({ code: 'code' }), 'code')
  assert.equal(describeError('plain'), 'plain')
})
