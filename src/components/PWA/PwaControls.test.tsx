import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PurchaseGuide, PwaInstallButton, StoreBottomNavigation } from './PwaControls';

describe('PwaInstallButton', () => {
  it('shows browser-specific installation instructions when the prompt is unavailable', () => {
    render(<PwaInstallButton />);

    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicativo MADU' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Instale a MADU');
    expect(screen.getByRole('dialog')).toHaveTextContent('menu do navegador');
  });

  it('uses the browser install prompt and hides the action after acceptance', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    });

    render(<PwaInstallButton />);
    act(() => {
      window.dispatchEvent(installEvent);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Instalar aplicativo MADU' }));

    expect(prompt).toHaveBeenCalledOnce();
    expect(installEvent.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Instalar aplicativo MADU' })).not.toBeInTheDocument();
    });
  });

  describe('PurchaseGuide', () => {
    it('opens the mobile purchase tutorial and closes with Escape', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <PurchaseGuide />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Como comprar' }));

      expect(screen.getByRole('dialog', { name: 'Como comprar' })).toBeInTheDocument();
      expect(screen.getByText(/Confirme com a loja/)).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('keeps the catalog section active while viewing a product', () => {
    render(
      <MemoryRouter initialEntries={['/produto/anel']}>
        <StoreBottomNavigation />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Produtos' })).toHaveClass('text-[#8B5E7C]');
  });

  it('does not show storefront navigation in the admin area', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <StoreBottomNavigation />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).not.toBeInTheDocument();
  });
});
