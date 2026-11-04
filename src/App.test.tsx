import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FloatingWhatsAppButton, Footer } from './App';

vi.mock('./context/StoreSettingsContext', () => ({
  useStoreSettings: () => ({ whatsappNumber: '5511999999999' }),
}));

describe('public storefront admin access link', () => {
  it('does not duplicate the administrative link in the footer', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Área administrativa' })).not.toBeInTheDocument();
  });
});

describe('floating WhatsApp button', () => {
  it('shows the complete label and remains visible on small screens', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <FloatingWhatsAppButton />
      </MemoryRouter>,
    );

    const button = screen.getByRole('link', { name: 'Falar com a Madu pelo WhatsApp' });
    expect(button).toHaveTextContent('Falar com a Madu');
    expect(button).not.toHaveClass('hidden');
    expect(button).toHaveAttribute('target', '_blank');
  });

  it('is absent from all administrative routes', () => {
    render(
      <MemoryRouter initialEntries={['/admin/pedidos']}>
        <FloatingWhatsAppButton />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: /Falar com a Madu/i })).not.toBeInTheDocument();
  });
});
