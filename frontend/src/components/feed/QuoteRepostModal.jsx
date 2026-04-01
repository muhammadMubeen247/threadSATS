import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import api from '@/api/axios';
import { Button } from '@/components/ui/button';
import MentionTextarea from '@/components/common/MentionTextarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export default function QuoteRepostModal({ open, onClose, threadId, onCreated }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState([]); // { file, previewUrl }[]
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setImages([]);
    setError('');
    setIsLoading(false);
  }, [open]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError('');
    const remaining = MAX_IMAGES - images.length;
    const accepted = [];
    for (const file of files.slice(0, remaining)) {
      if (!file.type?.startsWith('image/')) { setError('Only images are allowed'); continue; }
      if (file.size > MAX_IMAGE_BYTES) { setError('Each image must be ≤ 5 MB'); continue; }
      accepted.push({ file, previewUrl: URL.createObjectURL(file) });
    }
    if (files.length > remaining) setError(`Max ${MAX_IMAGES} images allowed`);
    if (accepted.length) setImages((prev) => [...prev, ...accepted]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeImage = (index) => {
    setImages((prev) => {
      const item = prev[index];
      if (item?.previewUrl) try { URL.revokeObjectURL(item.previewUrl); } catch {}
      return prev.filter((_, i) => i !== index);
    });
  };

  const submit = async () => {
    const content = text.trim();
    if (!content && images.length === 0) {
      setError('Add a comment or at least one image');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let uploadedImages = [];
      if (images.length > 0) {
        const formData = new FormData();
        images.forEach(({ file }) => formData.append('media', file));
        const uploadRes = await api.post('/upload/media', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploadedImages = uploadRes?.images || [];
      }

      const res = await api.post(`/threads/${threadId}/quote`, { content, images: uploadedImages });
      const created = res?.thread;
      if (created) onCreated?.(created);
      onClose?.();
    } catch (err) {
      setError(err?.userMessage || err?.message || 'Failed to quote repost');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose?.() : null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="sr-only">Quote repost</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="font-semibold">Quote repost</div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <MentionTextarea
            value={text}
            onValueChange={setText}
            placeholder="Add a comment..."
            maxLength={500}
            disabled={isLoading}
            className="min-h-[120px]"
            autoFocus
            enableHashtagSuggestions
          />

          {/* Image previews */}
          {images.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {images.map((item, index) => (
                <div key={item.previewUrl} className="relative group">
                  <img
                    src={item.previewUrl}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeImage(index)}
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-primary"
                onClick={() => fileRef.current?.click()}
                disabled={isLoading || images.length >= MAX_IMAGES}
                title="Add images"
              >
                <ImagePlus className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={isLoading || (!text.trim() && images.length === 0)}>
                {isLoading ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}