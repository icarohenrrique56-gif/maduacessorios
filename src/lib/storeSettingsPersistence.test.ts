import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  single: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: { from: mocks.from },
}));

import { getWhatsAppNumber, MADU_WHATSAPP_NUMBER, saveWhatsAppNumber } from './storeSettings';

describe('persisted WhatsApp settings', () => {
  beforeEach(() => {
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      maybeSingle: mocks.maybeSingle,
      upsert: mocks.upsert,
      single: mocks.single,
    };
    vi.clearAllMocks();
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.upsert.mockReturnValue(query);
  });

  it('loads the configured number from the public store settings row', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { whatsapp_number: '5511999999999' },
      error: null,
    });

    await expect(getWhatsAppNumber()).resolves.toBe('5511999999999');
    expect(mocks.from).toHaveBeenCalledWith('store_settings');
    expect(mocks.select).toHaveBeenCalledWith('whatsapp_number');
    expect(mocks.eq).toHaveBeenCalledWith('id', 'main');
  });

  it('persists and confirms a normalized number before returning it', async () => {
    mocks.single.mockResolvedValue({
      data: { whatsapp_number: '5511999999999' },
      error: null,
    });

    await expect(saveWhatsAppNumber('(11) 99999-9999')).resolves.toBe('5511999999999');
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'main',
        whatsapp_number: '5511999999999',
        updated_at: expect.any(String),
      }),
      { onConflict: 'id' },
    );
    expect(mocks.select).toHaveBeenCalledWith('whatsapp_number');
  });

  it('does not duplicate the Brazilian country code', async () => {
    mocks.single.mockResolvedValue({
      data: { whatsapp_number: '5511999999999' },
      error: null,
    });

    await expect(saveWhatsAppNumber('55 11 99999-9999')).resolves.toBe('5511999999999');
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp_number: '5511999999999' }),
      { onConflict: 'id' },
    );
  });

  it('does not reuse a fixed phone number when the database read fails', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });

    await expect(getWhatsAppNumber()).resolves.toBe(MADU_WHATSAPP_NUMBER);
  });
});
