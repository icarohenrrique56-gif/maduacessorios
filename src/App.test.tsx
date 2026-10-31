import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Footer } from './App';

vi.mock('./context/StoreSettingsContext', () => ({
  useStoreSettings: () => ({ whatsappNumber: '' }),
}));

describe('public storefront admin access link', () => {
  it('shows a discreet accessible gear link to admin login', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Área administrativa' })).toHaveAttribute(
      'href',
      '/admin/login',
    );
  });
});
