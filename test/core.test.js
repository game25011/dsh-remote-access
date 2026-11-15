import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULTS,
  buildLoginLink,
  buildQrSvg,
  derivePublicUrl,
  effectiveConfig,
  statusPayload,
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
test('buildQrSvg renders an SVG for a login link', () => {
  const svg = buildQrSvg('https://host.tail1234.ts.net/?token=abc')
  assert.match(svg, /^<svg/)
  assert.ok(svg.includes('rect') || svg.includes('path'))
  assert.equal(buildQrSvg(''), '')
})

test('statusPayload shapes the RPC value defensively', () => {
  const payload = statusPayload({
    link: 'https://h/?token=t',
    publicUrl: 'https://h/',
    qrSvg: '<svg/>',
    servePort: 443,
    serving: true,
    appPort: 1234,
    trusted: true,
  })
  assert.equal(payload.version, '0.2.0')
  assert.equal(payload.link, 'https://h/?token=t')
  assert.equal(payload.serving, true)
  assert.equal(payload.trusted, true)
  const empty = statusPayload({})
  assert.equal(empty.link, '')
  assert.equal(empty.qrSvg, '')
  assert.equal(empty.serving, false)
  assert.equal(empty.trusted, false)
})
