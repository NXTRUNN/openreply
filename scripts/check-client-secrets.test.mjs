import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const script = fileURLToPath(new URL('./check-client-secrets.mjs', import.meta.url));
function setup(t, compiled = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'openreply-credential-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, text) => { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, text); return target; };
  write('package.json', '{}'); write('node_modules/next/package.json', '{}');
  write('node_modules/next/node_modules/@next/env/index.js', 'exports.loadEnvConfig = () => {};');
  if (compiled) write('.next/static/app.js', 'console.log("fixture");');
  const scanner = write('scanner', '#!/usr/bin/env node\nprocess.stdout.write(process.env.FIXTURE_REPORT || "[]"); process.exitCode=Number(process.env.FIXTURE_STATUS || 0);'); chmodSync(scanner, 0o700);
  return { write, run: env => spawnSync(process.execPath, [script], { cwd: root, env: { PATH: process.env.PATH, GITLEAKS_BIN: scanner, ...env }, encoding: 'utf8' }) };
}
test('missing build and failed scanner cannot pass', t => {
  const empty = setup(t, false); assert.equal(empty.run({}).status, 2);
  const valid = setup(t); assert.equal(valid.run({ FIXTURE_STATUS: '2' }).status, 2);
  assert.equal(valid.run({ FIXTURE_REPORT: 'bad-json' }).status, 2);
});
test('private variables and prerendered payloads fail without logging the value', t => {
  const f = setup(t); const secret = randomBytes(32).toString('hex');
  f.write('.next/server/app/index.rsc', Buffer.from(secret).toString('base64'));
  const result = f.run({ NEXT_PUBLIC_API_SECRET: secret });
  assert.equal(result.status, 1); assert.equal(result.stdout.includes(secret), false);
  assert.equal(JSON.parse(result.stdout).findings[0].rule, 'private-environment-value');
});
test('public source maps and environment backups are blocked', t => {
  const f = setup(t); f.write('public/app.js.map', '{}'); f.write('public/.env.backup', 'fixture=true');
  const result = f.run({}); assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).findings.length, 2);
});
test('publishable keys pass; private matches remain redacted findings', t => {
  const f = setup(t); const publicKey = 'pk_live_' + randomBytes(24).toString('hex');
  assert.equal(f.run({ FIXTURE_STATUS: '1', FIXTURE_REPORT: JSON.stringify([{ Secret: publicKey }]) }).status, 0);
  const secret = randomBytes(32).toString('hex');
  const result = f.run({ FIXTURE_STATUS: '1', FIXTURE_REPORT: JSON.stringify([{ Secret: secret, RuleID: 'generic-api-key' }]) });
  assert.equal(result.status, 1); assert.equal(result.stdout.includes(secret), false);
});
