import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { corsHeaders } from '../_shared/cors.ts';

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };
const MAX_BODY_BYTES = 20_000;

function respond(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...jsonHeaders,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}

function isCartPayload(value: unknown): value is {
  items: Array<{ product_id: string; quantity: number; variation?: string | null }>;
  idempotencyKey?: string;
  releaseIdempotencyKey?: string;
} {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if (input.idempotencyKey !== undefined
    && (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length > 128)) return false;
  if (input.releaseIdempotencyKey !== undefined
    && (typeof input.releaseIdempotencyKey !== 'string' || input.releaseIdempotencyKey.length > 128)) return false;
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) return false;
  return input.items.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Record<string, unknown>;
    return typeof row.product_id === 'string'
      && row.product_id.length > 0
      && Number.isSafeInteger(row.quantity)
      && Number(row.quantity) > 0
      && Number(row.quantity) <= 25
      && (row.variation === undefined || row.variation === null || typeof row.variation === 'string');
  });
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  if (request.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405);

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return respond({ error: 'Carrinho muito grande.' }, 413);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return respond({ error: 'Carrinho muito grande.' }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return respond({ error: 'Formato de carrinho inválido.' }, 400);
  }
  if (!isCartPayload(body)) return respond({ error: 'Itens do carrinho inválidos.' }, 400);

  // Prefira cabeçalhos definidos pelo gateway; não aceite endereços enviados isoladamente pelo cliente.
  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  const clientIp = cloudflareIp || realIp || forwardedFor;
  if (!clientIp || clientIp.length > 128) {
    return respond({ error: 'Não foi possível validar a origem da solicitação.' }, 503);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Supabase service configuration is unavailable for stock validation.');
    return respond({ error: 'Validação do estoque temporariamente indisponível.' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ipHash = await sha256Hex(`${serviceRoleKey}|availability|${clientIp}`);
  const { data: limit, error: limitError } = await admin.rpc('consume_whatsapp_order_rate_limit', {
    p_ip_hash: ipHash,
    p_limit: 60,
  });
  if (limitError || !limit) {
    console.error('Could not apply stock validation rate limit:', limitError?.message ?? 'empty response');
    return respond({ error: 'Validação do estoque temporariamente indisponível.' }, 503);
  }
  if (limit.allowed !== true) {
    const retryAfter = Math.max(1, Number(limit.retry_after_seconds) || 60);
    return respond(
      { error: 'Muitas verificações de estoque. Aguarde um pouco e tente novamente.' },
      429,
      { 'Retry-After': String(retryAfter) },
    );
  }

  let reservationReleased = false;
  if (body.releaseIdempotencyKey) {
    const { data: release, error: releaseError } = await admin.rpc('release_whatsapp_order_reservation', {
      p_idempotency_key: body.releaseIdempotencyKey,
    });
    if (releaseError || !release) {
      console.error('Could not release prior checkout reservation:', releaseError?.message ?? 'empty response');
      return respond({ error: 'Não foi possível liberar a reserva anterior.' }, 503);
    }
    reservationReleased = release.released === true;
  }

  const { data, error } = await admin.rpc('validate_cart_stock', {
    p_items: body.items,
    p_idempotency_key: body.idempotencyKey ?? null,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : 400;
    return respond({ error: error.message || 'Não foi possível validar o estoque.' }, status);
  }
  return respond({
    ...data,
    reservation_released: reservationReleased,
    reservation_release_attempted: Boolean(body.releaseIdempotencyKey),
  }, 200);
});
