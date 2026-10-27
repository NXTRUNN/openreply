import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync, lstatSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Independent production client artifact check.
const root = process.cwd();
const findings = [];
const hashes = {
  linux_x64: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  linux_arm64: 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  darwin_x64: 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  darwin_arm64: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
};
const fingerprint = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
function publicValue(value) {
  if (/^(?:pk_(?:live|test)_|pk\.|phc_|sb_publishable_)/.test(value)) return true;
  try { const c = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()); return c.role === 'anon' && c.iss === 'supabase'; } catch { return false; }
}
function files(dir, keep = () => true) {
  if (!existsSync(dir)) return [];
  if (lstatSync(dir).isSymbolicLink()) throw Error('linked_artifact');
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error('linked_artifact');
    return entry.isDirectory() ? files(file, keep) : entry.isFile() && keep(file) ? [file] : [];
  });
}
const scratch = mkdtempSync(path.join(tmpdir(), 'openreply-secret-check-'));
try {
  const require = createRequire(path.join(root, 'package.json'));
  createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(root, false, { info() {}, error() {} });
  const compiled = files(path.join(root, '.next/static'));
  if (!compiled.some(file => file.endsWith('.js'))) throw Error('no_compiled_output');
  const targets = [...compiled, ...files(path.join(root, 'public')), ...files(path.join(root, '.next/server/app'), file => /\.(?:html|rsc|body|meta)$/.test(file)), ...files(path.join(root, '.next/server/pages'), file => /\.(?:html|json)$/.test(file))];
  let scanner = process.env.GITLEAKS_BIN;
  if (!scanner) {
    const platform = `${process.platform}_${process.arch}`;
    const expected = hashes[platform]; if (!expected) throw Error('unsupported_scanner_platform');
    const archive = `gitleaks_8.30.1_${platform}.tar.gz`;
    const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/${archive}`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error('scanner_download_failed');
    const data = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(data).digest('hex') !== expected) throw Error('scanner_checksum_failed');
    const file = path.join(scratch, archive); writeFileSync(file, data, { mode: 0o600 });
    if (spawnSync('tar', ['-xzf', file, '-C', scratch, 'gitleaks']).status !== 0) throw Error('scanner_extract_failed');
    scanner = path.join(scratch, 'gitleaks');
  }
  const config = path.join(scratch, 'default.toml'); writeFileSync(config, '[extend]\nuseDefault = true\n', { mode: 0o600 });
  const credentials = Object.entries(process.env).filter(([name, value]) => /SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY|SERVICE_ROLE|ENCRYPTION_KEY|DATABASE_URL|REDIS_URL|CONNECTION_STRING|SIGNING_KEY|P12_BASE64/.test(name) && value && value.length >= 8 && !publicValue(value));
  let publicMatches = 0;
  for (const file of targets) {
    const relative = path.relative(root, file); const content = readFileSync(file, 'utf8');
    if (file.endsWith('.map') || /(?:^|\/)\.env(?:$|[.\-])|(?:^|\/)\.git\//.test(relative)) findings.push({ file: relative, rule: 'public-sensitive-file' });
    for (const [name, value] of credentials) if ([value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value), Buffer.from(value).toString('base64')].some(form => content.includes(form))) findings.push({ file: relative, rule: 'private-environment-value', variable: name, fingerprint: fingerprint(value) });
    // Capture raw matches in memory, never forward stdout/stderr from the scanner.
    const scan = spawnSync(scanner, ['stdin', '--config', config, '--no-banner', '--log-level', 'fatal', '--report-format=json', '--report-path=-'], { input: content, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    if (scan.error || ![0, 1].includes(scan.status)) throw Error('scanner_failed');
    const matches = JSON.parse(scan.stdout || '[]');
    if (!Array.isArray(matches) || (scan.status === 1 && matches.length === 0)) throw Error('invalid_scanner_result');
    for (const match of matches) {
      if (!match.Secret) throw Error('invalid_scanner_result');
      if (publicValue(match.Secret)) publicMatches++;
      else findings.push({ file: relative, rule: match.RuleID, line: match.StartLine, fingerprint: fingerprint(match.Secret) });
    }
  }
  console.log(JSON.stringify({ passed: findings.length === 0, files: targets.length, publicMatches, findings }, null, 2));
  process.exitCode = findings.length ? 1 : 0;
} catch {
  console.error('Client credential check failed or could not complete; deployment must stop.'); process.exitCode = 2;
} finally { rmSync(scratch, { recursive: true, force: true }); }
