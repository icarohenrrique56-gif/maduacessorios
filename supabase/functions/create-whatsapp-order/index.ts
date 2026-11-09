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

function isOrderPayload(value: unknown): value is {
  items: Array<{ product_id: string; quantity: number; variation?: string }>;
  customerName?: string | null;
  customerPhone?: string | null;
  idempotencyKey: string;
} {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  return Array.isArray(input.items)
    && typeof input.idempotencyKey === 'string'
    && input.idempotencyKey.length > 0
    && input.idempotencyKey.length <= 128
    && (input.customerName === undefined || input.customerName === null || typeof input.customerName === 'string')
    && (input.customerPhone === undefined || input.customerPhone === null || typeof input.customerPhone === 'string');
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
  if (contentLength > MAX_BODY_BYTES) return respond({ error: 'Pedido muito grande.' }, 413);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return respond({ error: 'Pedido muito grande.' }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return respond({ error: 'Formato de pedido inválido.' }, 400);
  }
  if (!isOrderPayload(body)) return respond({ error: 'Dados do pedido inválidos.' }, 400);
  if (body.customerName && body.customerName.length > 120) {
    return respond({ error: 'Nome do cliente muito longo.' }, 400);
  }
  if (body.customerPhone && body.customerPhone.length > 32) {
    return respond({ error: 'Telefone muito longo.' }, 400);
  }

  // Prefira cabeçalhos definidos pelo gateway; não aceite endereços enviados isoladamente pelo cliente.
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  const clientIp = cloudflareIp || realIp || forwardedFor;
  if (!clientIp || clientIp.length > 128 || !/^[\da-fA-F:.%\[\]]+$/.test(clientIp)) {
    return respond({ error: 'Não foi possível validar a origem da solicitação.' }, 503);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Supabase service configuration is unavailable for order creation.');
    return respond({ error: 'Checkout temporariamente indisponível.' }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ipHash = await sha256Hex(`${serviceRoleKey}|order|${clientIp}`);
  const { data: limit, error: limitError } = await admin.rpc('consume_whatsapp_order_rate_limit', {
    p_ip_hash: ipHash,
    p_limit: 12,
  });
  if (limitError || !limit) {
    console.error('Could not apply order rate limit:', limitError?.message ?? 'empty response');
    return respond({ error: 'Checkout temporariamente indisponível.' }, 503);
  }
  if (limit.allowed !== true) {
    const retryAfter = Math.max(1, Number(limit.retry_after_seconds) || 60);
    return respond(
      { error: 'Muitas tentativas de pedido. Aguarde um pouco e tente novamente.' },
      429,
      { 'Retry-After': String(retryAfter) },
    );
  }

  const { data, error } = await admin.rpc('create_whatsapp_order', {
    p_items: body.items,
    p_customer_name: body.customerName ?? null,
    p_customer_phone: body.customerPhone ?? null,
    p_idempotency_key: body.idempotencyKey,
  });
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 409 : 400;
    return respond({ error: error.message || 'Não foi possível iniciar o pedido.' }, status);
  }

  return respond(data, 200);
});
