import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/axios';
import MentionTextarea from '@/components/common/MentionTextarea';

export default function CreateThreadModal({ isOpen, onClose, onThreadCreated }) {
  const { user, personas, activeMode } = useAuthStore();

  const activePersona = useMemo(() => {
    if (activeMode === 'anon') return personas?.anon;
    return personas?.public;
  }, [personas, activeMode]);

  const [content, setContent] = useState('');
  const [selectedImages, setSelectedImages] = useState([]); // [{ file, previewUrl }]
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const MAX_CHARS = 500;
  const MAX_IMAGES = 4;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

  const getInitials = (handleOrUsername) =>
    (handleOrUsername || '').substring(0, 2).toUpperCase() || 'U';

  const postingLabel = useMemo(() => {
    const handle = activePersona?.handle || user?.username || '';
    const modeLabel = activeMode === 'anon' ? 'Anon' : 'Public';
    return { handle, modeLabel };
  }, [activePersona, user, activeMode]);

  // Focus textarea when opened
  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, content, selectedImages]);

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const revokeAllPreviews = () => {
    for (const item of selectedImages) {
      try {
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      } catch {
        // ignore
      }
    }
  };

  const handleClose = () => {
    revokeAllPreviews();
    setContent('');
    setSelectedImages([]);
    setError('');
    setIsLoading(false);
    resetFileInput();
    onClose?.();
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setError('');

    const remaining = MAX_IMAGES - selectedImages.length;
    const nextFiles = files.slice(0, Math.max(0, remaining));

    if (selectedImages.length + files.length > MAX_IMAGES) {
      setError(`You can only upload up to ${MAX_IMAGES} images`);
    }

    const accepted = [];
    for (const file of nextFiles) {
      if (!file.type?.startsWith('image/')) {
        setError('Only image files are allowed');
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError(`Each image must be <= ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB`);
        continue;
      }
      accepted.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (accepted.length) {
      setSelectedImages((prev) => [...prev, ...accepted]);
    }

    // allow selecting the same file again later
    resetFileInput();
  };

  const handleRemoveImage = (index) => {
    setSelectedImages((prev) => {
      const item = prev[index];
      if (item?.previewUrl) {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {
          // ignore
        }
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const canPost = useMemo(() => {
    const hasText = content.trim().length > 0;
    const hasImages = selectedImages.length > 0;
    const withinLimit = content.length <= MAX_CHARS;
    return !isLoading && withinLimit && (hasText || hasImages);
  }, [content, selectedImages.length, isLoading]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!content.trim() && selectedImages.length === 0) {
      setError('Thread must have content or images');
      return;
    }
    if (content.length > MAX_CHARS) {
      setError(`Thread cannot exceed ${MAX_CHARS} characters`);
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let uploadedImages = [];

      // Upload images if any
      if (selectedImages.length > 0) {
        const formData = new FormData();
        selectedImages.forEach(({ file }) => formData.append('images', file));

        const uploadResponse = await api.post('/upload/images', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        uploadedImages = uploadResponse?.images || [];
      }

      // ✅ Option A: backend should infer persona from viewer context (active mode)
      const threadData = {
        content: content.trim(),
        images: uploadedImages,
      };

      const response = await api.post('/threads', threadData);

      if (response?.success) {
        onThreadCreated?.(response.thread);
        handleClose();
        return;
      }

      setError(response?.message || 'Failed to create thread');
    } catch (err) {
      setError(err?.message || 'Failed to create thread');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onMouseDown={(e) => {
        // click outside closes
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-background rounded-lg w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Create Thread</h2>
          <Button variant="ghost" size="icon" onClick={handleClose} type="button">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {error ? (
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
                {error}
              </div>
            ) : null}

            {/* Identity */}
            <div className="flex items-center space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarImage
                  src={activePersona?.profilePic || user?.profilePic || ''}
                  alt={postingLabel.handle}
                />
                <AvatarFallback>{getInitials(postingLabel.handle)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">
                    @{postingLabel.handle || 'user'}
                  </p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground">
                    {postingLabel.modeLabel}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Posting as your active persona
                </p>
              </div>
            </div>

            {/* Content */}
            <MentionTextarea
              value={content}
              onValueChange={setContent}
              placeholder="What's on your mind?"
              maxLength={MAX_CHARS}
              disabled={isLoading}
              className="text-lg"
              autoFocus
            />

            <div className="text-right text-sm text-muted-foreground">
              {content.length} / {MAX_CHARS}
            </div>

            {/* Images */}
            {selectedImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {selectedImages.map((item, index) => (
                  <div key={item.previewUrl} className="relative group">
                    <img
                      src={item.previewUrl}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-40 object-cover rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveImage(index)}
                      disabled={isLoading}
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="p-4 border-t flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
                disabled={isLoading || selectedImages.length >= MAX_IMAGES}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || selectedImages.length >= MAX_IMAGES}
                title="Add images"
              >
                <ImageIcon className="h-5 w-5" />
              </Button>

              <span className="text-sm text-muted-foreground">
                {selectedImages.length} / {MAX_IMAGES}
              </span>
            </div>

            <Button type="submit" disabled={!canPost}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Post
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}