import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Image as ImageIcon, Film, Loader2 } from 'lucide-react';
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
  const [selectedMedia, setSelectedMedia] = useState([]); // [{ file, previewUrl, type: 'image'|'video' }]
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const MAX_CHARS = 500;
  const MAX_MEDIA = 4;
  const MAX_VIDEOS = 2;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
  const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50MB
  const MAX_VIDEO_DURATION = 60; // seconds

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
  }, [isOpen, content, selectedMedia]);

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const revokeAllPreviews = () => {
    for (const item of selectedMedia) {
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
    setSelectedMedia([]);
    setError('');
    setIsLoading(false);
    resetFileInput();
    onClose?.();
  };

  const getVideoDuration = (file) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(0);
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const handleMediaSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setError('');

    const remaining = MAX_MEDIA - selectedMedia.length;
    const nextFiles = files.slice(0, Math.max(0, remaining));
    const currentVideoCount = selectedMedia.filter((m) => m.type === 'video').length;

    if (selectedMedia.length + files.length > MAX_MEDIA) {
      setError(`You can only upload up to ${MAX_MEDIA} media files`);
    }

    const accepted = [];
    let videoCount = currentVideoCount;

    for (const file of nextFiles) {
      const isImage = file.type?.startsWith('image/');
      const isVideo = file.type?.startsWith('video/');

      if (!isImage && !isVideo) {
        setError('Only image and video files are allowed');
        continue;
      }

      if (isImage && file.size > MAX_IMAGE_BYTES) {
        setError(`Each image must be <= ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))}MB`);
        continue;
      }

      if (isVideo) {
        if (file.size > MAX_VIDEO_BYTES) {
          setError(`Each video must be <= ${Math.floor(MAX_VIDEO_BYTES / (1024 * 1024))}MB`);
          continue;
        }
        if (videoCount >= MAX_VIDEOS) {
          setError(`Maximum ${MAX_VIDEOS} videos allowed`);
          continue;
        }
        const duration = await getVideoDuration(file);
        if (duration > MAX_VIDEO_DURATION) {
          setError(`Video must be ${MAX_VIDEO_DURATION} seconds or less`);
          continue;
        }
        videoCount++;
      }

      accepted.push({
        file,
        previewUrl: URL.createObjectURL(file),
        type: isVideo ? 'video' : 'image',
      });
    }

    if (accepted.length) {
      setSelectedMedia((prev) => [...prev, ...accepted]);
    }

    resetFileInput();
  };

  const handleRemoveMedia = (index) => {
    setSelectedMedia((prev) => {
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
    const hasMedia = selectedMedia.length > 0;
    const withinLimit = content.length <= MAX_CHARS;
    return !isLoading && withinLimit && (hasText || hasMedia);
  }, [content, selectedMedia.length, isLoading]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!content.trim() && selectedMedia.length === 0) {
      setError('Thread must have content or media');
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
      let uploadedVideos = [];

      if (selectedMedia.length > 0) {
        const formData = new FormData();
        selectedMedia.forEach(({ file }) => formData.append('media', file));

        const uploadResponse = await api.post('/upload/media', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        uploadedImages = uploadResponse?.images || [];
        uploadedVideos = uploadResponse?.videos || [];
      }

      const threadData = {
        content: content.trim(),
        images: uploadedImages,
        videos: uploadedVideos,
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
              enableHashtagSuggestions // ✅
            />

            <div className="text-right text-sm text-muted-foreground">
              {content.length} / {MAX_CHARS}
            </div>

            {/* Media previews */}
            {selectedMedia.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {selectedMedia.map((item, index) => (
                  <div key={item.previewUrl} className="relative group">
                    {item.type === 'video' ? (
                      <video
                        src={item.previewUrl}
                        className="w-full h-40 object-cover rounded-lg"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={item.previewUrl}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-40 object-cover rounded-lg"
                      />
                    )}
                    {item.type === 'video' ? (
                      <div className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white flex items-center gap-1">
                        <Film className="h-3 w-3" /> Video
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveMedia(index)}
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
                accept="image/*,video/*"
                multiple
                onChange={handleMediaSelect}
                className="hidden"
                disabled={isLoading || selectedMedia.length >= MAX_MEDIA}
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || selectedMedia.length >= MAX_MEDIA}
                title="Add media"
              >
                <ImageIcon className="h-5 w-5" />
              </Button>

              <span className="text-sm text-muted-foreground">
                {selectedMedia.length} / {MAX_MEDIA}
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