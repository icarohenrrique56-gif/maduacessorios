import { useEffect, useState } from 'react';

type ProductImageFieldProps = {
  currentImage: string;
  selectedFile: File | null;
  error?: string;
  disabled?: boolean;
  onFileChange: (file: File) => void;
};

export function ProductImageField({
  currentImage,
  selectedFile,
  error,
  disabled = false,
  onFileChange,
}: ProductImageFieldProps) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  function chooseFile(file: File | undefined) {
    if (file) onFileChange(file);
  }

  const imagePreview = previewUrl || currentImage;

  return (
    <div className="block text-sm text-[#5d4454]">
      <label htmlFor="product-image-upload" className="font-medium">
        Imagem do produto *
      </label>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            setIsDragging(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (!disabled) chooseFile(event.dataTransfer.files[0]);
        }}
        className={`mt-1 rounded-2xl border-2 border-dashed p-3 transition ${
          isDragging ? 'border-[#8B5E7C] bg-[#f8e9ef]' : 'border-[#efd7e7] bg-[#fffafc]'
        }`}
      >
        {imagePreview ? (
          <img
            src={imagePreview}
            alt="Prévia da imagem do produto"
            className="mb-3 h-40 w-full rounded-xl object-contain"
          />
        ) : (
          <div className="mb-3 flex h-40 items-center justify-center rounded-xl bg-[#f9eff4] text-center text-sm text-[#8B5E7C]">
            Arraste uma imagem até aqui
          </div>
        )}
        <label
          htmlFor="product-image-upload"
          className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-[#d9bfd0] px-4 py-2 text-center font-medium text-[#76506a] ${
            disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-[#f8e9ef]'
          }`}
        >
          {selectedFile ? 'Escolher outra imagem' : 'Selecionar imagem'}
        </label>
        <input
          id="product-image-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'product-image-error' : 'product-image-help'}
          className="sr-only"
          onChange={(event) => {
            chooseFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <p id="product-image-help" className="mt-2 text-xs text-[#76506a]">
          JPG, PNG ou WebP · máximo 10 MB
          {selectedFile ? ` · ${selectedFile.name}` : ''}
        </p>
        {error && (
          <p id="product-image-error" role="alert" className="mt-1 text-xs text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
