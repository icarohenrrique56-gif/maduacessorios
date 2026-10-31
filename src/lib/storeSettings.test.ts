import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: null }));

import { normalizeWhatsAppNumber } from './storeSettings';

describe('WhatsApp number normalization', () => {
  it.each([
    ['11 99999-9999', '5511999999999'],
    ['+55 (11) 99999-9999', '5511999999999'],
    ['55 11 99999-9999', '5511999999999'],
    ['0055 11 99999-9999', '5511999999999'],
    ['+1 (202) 555-0100', '12025550100'],
  ])('normalizes %s to E.164 digits', (input, expected) => {
    expect(normalizeWhatsAppNumber(input)).toBe(expected);
  });

  it.each(['', 'abc', '123', '+55 (11) 123', '+1234567890123456'])(
    'rejects invalid numbers: %s',
    (input) => {
      expect(normalizeWhatsAppNumber(input)).toBeNull();
    },
  );
});
