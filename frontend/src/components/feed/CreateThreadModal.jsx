import { useState } from 'react';
import { X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import useAuthStore from '@/store/authStore';
import api from '@/api/axios';

export default function CreateThreadModal({ isOpen, onClose, onThreadCreated }) {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const MAX_CHARS = 500;
  const MAX_IMAGES = 4;

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || 'U';
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    
    if (selectedImages.length + files.length > MAX_IMAGES) {
      setError(`You can only upload up to ${MAX_IMAGES} images`);
      return;
    }

    setSelectedImages([...selectedImages, ...files]);
    setError('');
  };

  const handleRemoveImage = (index) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index));
  };

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
        selectedImages.forEach((file) => {
          formData.append('images', file);
        });

        const uploadResponse = await api.post('/upload/images', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        uploadedImages = uploadResponse.images || [];
      }

      // Create thread with backend structure
      const threadData = {
        content: content.trim(),
        isAnonymous,
        images: uploadedImages, // Array of { url, publicId, thumbnail, width, height, format }
      };

      const response = await api.post('/threads', threadData);

      if (response.success) {
        onThreadCreated?.(response.thread);
        handleClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to create thread');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setContent('');
    setSelectedImages([]);
    setIsAnonymous(false);
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Create Thread</h2>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Error Message */}
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
                {error}
              </div>
            )}

            {/* User Info */}
            <div className="flex items-center space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={user?.profilePic} alt={user?.username} />
                <AvatarFallback>
                  {isAnonymous ? 'A' : getInitials(user?.username)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">
                  {isAnonymous ? 'Anonymous' : `@${user?.username}`}
                </p>
              </div>
            </div>

            {/* Content Textarea */}
            <Textarea
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[150px] resize-none border-0 focus-visible:ring-0 text-lg"
              maxLength={MAX_CHARS}
            />

            {/* Character Count */}
            <div className="text-right text-sm text-muted-foreground">
              {content.length} / {MAX_CHARS}
            </div>

            {/* Image Preview */}
            {selectedImages.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {selectedImages.map((file, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-40 object-cover rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveImage(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Anonymous Toggle */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label htmlFor="anonymous" className="font-medium">
                  Post Anonymously
                </Label>
                <p className="text-sm text-muted-foreground">
                  Your identity will be hidden
                </p>
              </div>
              <Switch
                id="anonymous"
                checked={isAnonymous}
                onCheckedChange={setIsAnonymous}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <input
                type="file"
                id="image-upload"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
                disabled={selectedImages.length >= MAX_IMAGES}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => document.getElementById('image-upload').click()}
                disabled={selectedImages.length >= MAX_IMAGES}
              >
                <ImageIcon className="h-5 w-5" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedImages.length} / {MAX_IMAGES}
              </span>
            </div>

            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}