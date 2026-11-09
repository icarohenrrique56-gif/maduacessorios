import { describe, expect, it } from 'vitest';
import { validateSupabaseConfig } from './check-supabase-config.mjs';

function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('Supabase build configuration guard', () => {
  it('accepts a real HTTPS project URL with a publishable key', () => {
    expect(validateSupabaseConfig({
      VITE_SUPABASE_URL: 'https://madu-shop.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop',
    })).toEqual({ ok: true, issues: [] });
  });

  it('rejects missing values and example URLs', () => {
    expect(validateSupabaseConfig({})).toMatchObject({ ok: false });
    expect(validateSupabaseConfig({
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJhbGci.eyJyb2xlIjoiYW5vbiJ9.signature',
    })).toMatchObject({ ok: false });
  });

  it('rejects service-role JWTs and secret API keys', () => {
    const common = { VITE_SUPABASE_URL: 'https://madu-shop.supabase.co' };
    expect(validateSupabaseConfig({
      ...common,
      VITE_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }),
    })).toMatchObject({ ok: false });
    expect(validateSupabaseConfig({
      ...common,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnop',
    })).toMatchObject({ ok: false });
  });

  it('rejects insecure, malformed, or non-project URLs', () => {
    for (const url of [
      'http://madu-shop.supabase.co',
      'not a url',
      'https://your-project.supabase.co',
      'https://madu-shop.supabase.co/rest/v1',
    ]) {
      expect(validateSupabaseConfig({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnop',
      })).toMatchObject({ ok: false });
    }
  });
});
