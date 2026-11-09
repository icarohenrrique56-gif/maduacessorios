import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const placeholderPattern = /(example|your[-_ ]?project|placeholder|replace[-_ ]?me|supabase\.co\.test)/i;

function readEnvFiles(env, cwd = process.cwd()) {
  for (const filename of ['.env.production.local', '.env.local', '.env']) {
    const path = resolve(cwd, filename);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match && env[match[1]] === undefined) {
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
      }
    }
  }
  return env;
}

function hasValidPublicKey(key) {
  if (!key || placeholderPattern.test(key) || /^sb_secret_/i.test(key)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(key)) return true;
  if (!key.startsWith('eyJ')) return false;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return payload.role !== 'service_role' && payload.role !== 'supabase_admin';
  } catch {
    return false;
  }
}

export function validateSupabaseConfig(env) {
  const rawUrl = env.VITE_SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const key = (
    env.VITE_SUPABASE_PUBLISHABLE_KEY
    || env.VITE_SUPABASE_ANON_KEY
    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || ''
  ).trim();

  let validUrl = false;
  try {
    const parsed = new URL(rawUrl);
    validUrl = parsed.protocol === 'https:'
      && Boolean(parsed.hostname)
      && !placeholderPattern.test(parsed.hostname)
      && !parsed.username
      && !parsed.password
      && parsed.pathname === '/'
      && !parsed.search
      && !parsed.hash;
  } catch {
    validUrl = false;
  }

  const validKey = hasValidPublicKey(key);
  const issues = [];
  if (!validUrl) issues.push('VITE_SUPABASE_URL deve ser uma URL HTTPS real do projeto, sem placeholders.');
  if (!validKey) issues.push('Configure uma chave anon/publicável válida; nunca use service_role ou sb_secret_.');
  return { ok: issues.length === 0, issues };
}

function main() {
  const env = readEnvFiles({ ...process.env });
  const result = validateSupabaseConfig(env);
  if (result.ok) return;

  console.error(`Build bloqueado: ${result.issues.join(' ')}`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
