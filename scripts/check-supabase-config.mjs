import { readFileSync, existsSync } from 'node:fs';

const env = { ...process.env };
for (const filename of ['.env.production.local', '.env.local', '.env']) {
  if (!existsSync(filename)) continue;
  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && env[match[1]] === undefined) {
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

const url = env.VITE_SUPABASE_URL?.trim();
const publishableKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  env.VITE_SUPABASE_ANON_KEY?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

const placeholderUrl = !url || url.includes('example.supabase.co');
const placeholderKey =
  !publishableKey ||
  publishableKey.includes('replace-with') ||
  publishableKey.includes('your-');

if (placeholderUrl || placeholderKey) {
  console.error(
    'Build bloqueado: configure VITE_SUPABASE_URL e uma chave pública do Supabase ' +
    '(VITE_SUPABASE_PUBLISHABLE_KEY ou VITE_SUPABASE_ANON_KEY). Nunca use service_role.',
  );
  process.exit(1);
}
