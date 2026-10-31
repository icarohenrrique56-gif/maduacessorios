import { defaultCategories } from '../data/mockProducts';
import { supabase } from './supabase';

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  is_active: boolean;
  position: number;
};

export function buildCategorySlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'categoria';
}

export function normalizeCategory(record: Record<string, unknown>): Category {
  const name = typeof record.name === 'string' ? record.name.trim() : 'Nova categoria';
  const slug = typeof record.slug === 'string' && record.slug.trim() ? record.slug.trim() : buildCategorySlug(name);

  return {
    id: String(record.id ?? crypto.randomUUID()),
    name,
    slug,
    description: typeof record.description === 'string' ? record.description : '',
    image_url: typeof record.image_url === 'string' ? record.image_url : '',
    is_active: record.is_active !== false,
    position: Number(record.position ?? 0),
  };
}

export async function getCategoriesFromSupabase(includeInactive = false): Promise<Category[]> {
  if (!supabase) {
    return (includeInactive ? defaultCategories : defaultCategories.filter((category) => category.is_active !== false)).map((category) =>
      normalizeCategory(category as Record<string, unknown>),
    );
  }

  try {
    let query = supabase.from('categories').select('*');
    if (!includeInactive) query = query.eq('is_active', true);

    const { data, error } = await query.order('position', { ascending: true }).order('name', { ascending: true });
    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        const fallback = await supabase.from('categories').select('*').order('position', { ascending: true }).order('name', { ascending: true });
        if (fallback.error) throw new Error(fallback.error.message);
        return (fallback.data ?? []).map((record) => normalizeCategory(record as Record<string, unknown>));
      }
      throw new Error(error.message);
    }

    return (data ?? []).map((record) => normalizeCategory(record as Record<string, unknown>));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Erro ao carregar categorias.';
    if (reason.includes('does not exist') || reason.includes('permission denied')) {
      return defaultCategories
        .filter((category) => includeInactive || category.is_active !== false)
        .map((category) => normalizeCategory(category as Record<string, unknown>));
    }
    throw new Error(`Não foi possível carregar as categorias: ${reason}`);
  }
}

export async function saveCategoryToSupabase(
  category: Partial<Category> & { id?: string; name: string },
): Promise<{ ok: true; category: Category } | { ok: false; reason: string }> {
  if (!supabase) {
    return { ok: false, reason: 'Credenciais do Supabase ausentes.' };
  }

  const name = category.name.trim();
  if (!name) {
    return { ok: false, reason: 'Informe um nome para a categoria.' };
  }

  const payload = {
    id: category.id,
    name,
    slug: category.slug || buildCategorySlug(name),
    description: category.description ?? '',
    image_url: category.image_url ?? '',
    is_active: category.is_active ?? true,
    position: Number(category.position ?? 0),
  };

  try {
    if (category.id) {
      const { data, error } = await supabase
        .from('categories')
        .update(payload)
        .eq('id', category.id)
        .select('*')
        .single();

      if (error) {
        if (error.message.includes('column') && error.message.includes('does not exist')) {
          const fallback = await supabase
            .from('categories')
            .update({ name, slug: payload.slug, position: payload.position })
            .eq('id', category.id)
            .select('*')
            .single();
          if (fallback.error) throw new Error(fallback.error.message);
          return { ok: true, category: normalizeCategory(fallback.data as Record<string, unknown>) };
        }
        throw new Error(error.message);
      }
      return { ok: true, category: normalizeCategory(data as Record<string, unknown>) };
    }

    const { data, error } = await supabase
      .from('categories')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        const fallback = await supabase
          .from('categories')
          .insert({ name, slug: payload.slug, position: payload.position })
          .select('*')
          .single();
        if (fallback.error) throw new Error(fallback.error.message);
        return { ok: true, category: normalizeCategory(fallback.data as Record<string, unknown>) };
      }
      throw new Error(error.message);
    }

    return { ok: true, category: normalizeCategory(data as Record<string, unknown>) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Não foi possível salvar a categoria.' };
  }
}

export async function deleteCategoryFromSupabase(categoryId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!supabase) {
    return { ok: false, reason: 'Credenciais do Supabase ausentes.' };
  }

  try {
    const { error } = await supabase.from('categories').delete().eq('id', categoryId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Não foi possível remover a categoria.' };
  }
}
