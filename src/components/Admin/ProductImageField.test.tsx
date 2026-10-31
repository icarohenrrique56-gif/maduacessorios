import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductImageField } from './ProductImageField';

describe('ProductImageField', () => {
  it('shows the saved product image and accepts the supported formats', () => {
    render(
      <ProductImageField
        currentImage="https://example.com/product.webp"
        selectedFile={null}
        onFileChange={vi.fn()}
      />,
    );

    expect(screen.getByAltText('Prévia da imagem do produto')).toHaveAttribute(
      'src',
      'https://example.com/product.webp',
    );
    expect(screen.getByLabelText('Selecionar imagem')).toHaveAttribute('type', 'file');
    expect(screen.getByLabelText('Imagem do produto *')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    );
  });

  it('forwards a selected file and displays validation errors', () => {
    const onFileChange = vi.fn();
    const file = new File(['image'], 'product.png', { type: 'image/png' });
    render(
      <ProductImageField
        currentImage=""
        selectedFile={null}
        error="A imagem deve ter no máximo 10 MB."
        onFileChange={onFileChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Imagem do produto *'), {
      target: { files: [file] },
    });

    expect(onFileChange).toHaveBeenCalledWith(file);
    expect(screen.getByRole('alert')).toHaveTextContent('A imagem deve ter no máximo 10 MB.');
  });
});
