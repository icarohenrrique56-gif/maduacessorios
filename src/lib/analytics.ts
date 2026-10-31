import { supabase } from './supabase';

export type StorefrontEventName =
  | 'product_view'
  | 'catalog_search'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'whatsapp_checkout';

export async function trackStorefrontEvent(
  eventName: StorefrontEventName,
  options?: { productId?: string; searchTerm?: string },
): Promise<void> {
  if (!supabase) return;

  await supabase.from('storefront_events').insert({
    event_name: eventName,
    product_id: options?.productId ?? null,
    search_term: options?.searchTerm
      ? options.searchTerm.trim().slice(0, 100)
      : null,
  });
}
