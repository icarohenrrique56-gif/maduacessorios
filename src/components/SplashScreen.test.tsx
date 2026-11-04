import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SplashScreen } from './SplashScreen';

describe('SplashScreen', () => {
  it('uses the original logo without a duplicate title or fake percentage', () => {
    vi.useFakeTimers();
    render(<SplashScreen isReady={false} storeReady={false} authReady={false} />);

    expect(screen.getByRole('img', { name: 'Madu Acessórios' })).toHaveAttribute(
      'src',
      '/assets/brand/madu-logo-transparent.png',
    );
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Preparando sua experiência...')).toBeInTheDocument();
    expect(screen.getByText('Detalhes que fazem você brilhar.')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
