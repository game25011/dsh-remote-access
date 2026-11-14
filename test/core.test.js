import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULTS,
  buildLoginLink,
  derivePublicUrl,
  effectiveConfig,
  trustHint,
} from '../index.js'

test('effectiveConfig merges defaults and coerces values', () => {
  const config = effectiveConfig({ servePort: '8443', serve: 'no', publicUrl: ' https://x/ ' })
  assert.equal(config.servePort, 8443)
  assert.equal(config.serve, true) // only literal false disables
  assert.equal(config.publicUrl, 'https://x/')
  assert.equal(config.statusTimeoutMs, DEFAULTS.statusTimeoutMs)
  assert.equal(effectiveConfig(undefined).servePort, 443)
  assert.equal(effectiveConfig({ serve: false }).serve, false)
})

test('derivePublicUrl reads the MagicDNS name', () => {
  assert.equal(derivePublicUrl({ Self: { DNSName: 'host.tail1234.ts.net.' } }), 'https://host.tail1234.ts.net/')
  assert.equal(derivePublicUrl({ Self: {} }), '')
  assert.equal(derivePublicUrl(undefined), '')
})

test('buildLoginLink keeps the token and trims slashes', () => {
  const link = buildLoginLink('https://h.ts.net/', 'http://127.0.0.1:8080/?token=abc')
  assert.equal(link, 'https://h.ts.net/?token=abc')
  assert.equal(buildLoginLink('https://h.ts.net', 'http://127.0.0.1:1/'), 'https://h.ts.net/')
  assert.equal(buildLoginLink('', 'http://127.0.0.1:1/?token=x'), '/?token=x')
})

test('trustHint reports missing trusted hosts', () => {
  const missing = trustHint({ trustedHosts: [] }, 'https://h.ts.net/')
  assert.match(missing, /h\.ts\.net/)
  assert.equal(trustHint({ trustedHosts: ['h.ts.net'] }, 'https://h.ts.net/'), '')
  assert.equal(trustHint({ trustedHosts: ['h.ts.net:8443'] }, 'https://h.ts.net/'), '')
  assert.equal(trustHint({}, 'not a url'), '')
})
