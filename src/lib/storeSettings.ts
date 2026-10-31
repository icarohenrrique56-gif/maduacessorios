import { supabase } from './supabase';

export const MADU_WHATSAPP_NUMBER = '5575991334055';
export const WHATSAPP_COMPATIBLE_EMOJIS = [
  '🌷', '🛍️', '🧾', '💬', '📦', '🚚', '💳', '✅',
  '❤️', '🌸', '✨', '🛒', '📲', '📸', '🎀', '🩷',
] as const;
export const DEFAULT_WHATSAPP_ORDER_MESSAGE = `🌷 PEDIDO MADU

🛍️ SEU PRODUTO

{items}

━━━━━━━━━━━━━━

🧾 RESUMO

Pedido: {order_number}

TOTAL: {subtotal}

━━━━━━━━━━━━━━

💬 Vamos confirmar a disponibilidade e combinar pagamento e entrega com você!

Obrigada por escolher a Madu! 🌷`;

export function normalizeWhatsAppNumber(value: string): string | null {
  const input = value.trim();
  if (!input || !/^[+\d\s().-]+$/.test(input)) return null;

  let digits = input.replace(/\D/g, '');
  if (input.startsWith('00')) digits = digits.slice(2);
  else if (
    !input.startsWith('+')
    && !digits.startsWith('55')
    && (digits.length === 10 || digits.length === 11)
  ) {
    digits = `55${digits}`;
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export async function getWhatsAppNumber(): Promise<string> {
  const environmentNumber = normalizeWhatsAppNumber(import.meta.env.VITE_WHATSAPP_NUMBER ?? '') ?? '';
  if (!supabase) return environmentNumber || MADU_WHATSAPP_NUMBER;

  const { data, error } = await supabase
    .from('store_settings')
    .select('whatsapp_number')
    .eq('id', 'main')
    .maybeSingle();

  if (error) {
    return environmentNumber || MADU_WHATSAPP_NUMBER;
  }
  if (!data) return environmentNumber || MADU_WHATSAPP_NUMBER;

  const storedValue = typeof data.whatsapp_number === 'string' ? data.whatsapp_number : '';
  if (!storedValue) return environmentNumber || MADU_WHATSAPP_NUMBER;

  const normalized = normalizeWhatsAppNumber(storedValue);
  if (!normalized) return environmentNumber || MADU_WHATSAPP_NUMBER;
  return normalized;
}

export async function saveWhatsAppNumber(value: string): Promise<string> {
  const normalized = normalizeWhatsAppNumber(value);
  if (!normalized) {
    throw new Error('Informe um número de WhatsApp válido com código do país.');
  }
  if (!supabase) throw new Error('Supabase não configurado. O número não foi salvo.');

  const { data, error } = await supabase
    .from('store_settings')
    .upsert({
      id: 'main',
      whatsapp_number: normalized,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('whatsapp_number')
    .single();

  if (error) throw new Error(`Não foi possível salvar o WhatsApp da loja: ${error.message}`);
  const confirmedNumber = typeof data?.whatsapp_number === 'string'
    ? normalizeWhatsAppNumber(data.whatsapp_number)
    : null;
  if (confirmedNumber !== normalized) {
    throw new Error('O Supabase não confirmou o número de WhatsApp salvo.');
  }
  return confirmedNumber;
}

export async function getWhatsAppOrderMessage(): Promise<string> {
  if (!supabase) return DEFAULT_WHATSAPP_ORDER_MESSAGE;
  const { data, error } = await supabase
    .from('store_settings')
    .select('whatsapp_order_message')
    .eq('id', 'main')
    .maybeSingle();
  if (error || !data) return DEFAULT_WHATSAPP_ORDER_MESSAGE;
  return typeof data.whatsapp_order_message === 'string' && data.whatsapp_order_message.trim()
    ? data.whatsapp_order_message
    : DEFAULT_WHATSAPP_ORDER_MESSAGE;
}

export async function saveWhatsAppOrderMessage(value: string): Promise<string> {
  if (!supabase) throw new Error('Supabase não configurado. A mensagem não foi salva.');
  const message = value.trim();
  if (!message) throw new Error('Escreva a mensagem que será enviada no pedido.');
  const { data, error } = await supabase
    .from('store_settings')
    .upsert({
      id: 'main',
      whatsapp_order_message: message,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    .select('whatsapp_order_message')
    .single();
  if (error) throw new Error(`Não foi possível salvar a mensagem do pedido: ${error.message}`);
  if (typeof data?.whatsapp_order_message !== 'string') {
    throw new Error('O Supabase não confirmou a mensagem do pedido.');
  }
  return data.whatsapp_order_message;
}
