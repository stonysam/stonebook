'use client';

import { useRef, useState } from 'react';

const MAX_SIDE = 1280;

/** Shrinks a photo in the browser to a JPEG of at most 1280 px, so uploads stay small. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('encode'))), 'image/jpeg', 0.82));
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

/** A photo for an item: keeps the current one (f_photo) unless replaced (photo_file) or removed. */
export function PhotoInput({ current, currentUrl, label }: { current: string; currentUrl?: string | null; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [kept, setKept] = useState(current);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file || !input.current) return;
    setBusy(true);
    setError(null);
    try {
      const small = await shrink(file);
      const list = new DataTransfer();
      list.items.add(small);
      input.current.files = list.files;
      setPreview(URL.createObjectURL(small));
    } catch {
      input.current.value = '';
      setError('That photo couldn’t be read. Try another one.');
    }
    setBusy(false);
  };
  const clear = () => {
    if (input.current) input.current.value = '';
    setKept('');
    setPreview(null);
  };

  return (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="small" style={{ marginBottom: 8 }}>{label}</legend>
      <input type="hidden" name="f_photo" value={kept} />
      <input ref={input} type="file" name="photo_file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="row" style={{ gap: 12 }}>
        {preview
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={preview} alt="" className="photo" style={{ width: 88, height: 88 }} />
          : <div className="photo photo-empty" style={{ width: 88, height: 88 }} aria-hidden />}
        <div className="stack" style={{ gap: 4 }}>
          <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Getting it ready…' : preview ? 'Change photo' : 'Add a photo'}
          </button>
          {preview && <button type="button" className="btn btn-text" style={{ minHeight: 32 }} onClick={clear}>Remove</button>}
        </div>
      </div>
      {error && <span role="alert" className="small">{error}</span>}
    </fieldset>
  );
}
