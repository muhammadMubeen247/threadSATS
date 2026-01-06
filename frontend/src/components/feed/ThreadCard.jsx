import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Repeat2, MoreVertical, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import useAuthStore from '@/store/authStore';
import api from '@/api/axios';
import ImageLightbox from './ImageLightbox';

export default function ThreadCard({ thread, onDelete, onUpdate }) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  // Get thread ID
  const threadId = thread?._id || thread?.id;
  
  const [isLiked, setIsLiked] = useState(thread.isLiked || false);
  const [likesCount, setLikesCount] = useState(thread.likesCount || 0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const isOwner = user?._id === thread.author?._id || user?.id === thread.author?.id;

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || 'A';
  };

  const getTimeAgo = (date) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return 'Just now';
    }
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    
    if (!threadId) {
      console.error('Thread ID is missing:', thread);
      return;
    }
    
    try {
      await api.put(`/threads/${threadId}/like`);
      setIsLiked(!isLiked);
      setLikesCount(isLiked ? likesCount - 1 : likesCount + 1);
    } catch (error) {
      console.error('Failed to like thread:', error);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    
    if (!threadId) {
      console.error('Thread ID is missing:', thread);
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this thread?')) {
      try {
        await api.delete(`/threads/${threadId}`);
        onDelete?.(threadId);
      } catch (error) {
        console.error('Failed to delete thread:', error);
      }
    }
  };

  const handleFollow = async (e) => {
    e.stopPropagation();
    
    const authorId = thread.author?._id || thread.author?.id;
    
    if (!authorId) {
      console.error('Author ID is missing:', thread);
      return;
    }
    
    try {
      if (isFollowing) {
        await api.delete(`/users/${authorId}/unfollow`);
      } else {
        await api.post(`/users/${authorId}/follow`);
      }
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error('Failed to follow/unfollow:', error);
    }
  };

  const handleThreadClick = () => {
    if (threadId) {
      navigate(`/thread/${threadId}`);
    }
  };

  const handleImageClick = (e, index) => {
    e.stopPropagation();
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Get image URLs for lightbox
  const imageUrls = thread.images?.map(img => img.url || img) || [];

  return (
    <>
      <div
        className="border-b p-4 hover:bg-muted/50 cursor-pointer transition-colors"
        onClick={handleThreadClick}
      >
        <div className="flex space-x-3">
          {/* Avatar */}
          <Link
            to={`/profile/${thread.author?.username}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar className="h-10 w-10">
              <AvatarImage
                src={thread.author?.profilePic}
                alt={thread.author?.username}
              />
              <AvatarFallback>
                {thread.isAnonymous ? 'A' : getInitials(thread.author?.username)}
              </AvatarFallback>
            </Avatar>
          </Link>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Link
                  to={`/profile/${thread.author?.username}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-semibold hover:underline"
                >
                  {thread.isAnonymous ? 'Anonymous' : `@${thread.author?.username}`}
                </Link>
                <span className="text-sm text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">
                  {getTimeAgo(thread.createdAt)}
                </span>
                {!isOwner && !thread.isAnonymous && (
                  <>
                    <span className="text-sm text-muted-foreground">•</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-sm"
                      onClick={handleFollow}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </Button>
                  </>
                )}
              </div>

              {/* Three-dot menu */}
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Thread Content */}
            <p className="mt-2 text-sm whitespace-pre-wrap break-words">
              {thread.content}
            </p>

            {/* Images */}
            {thread.images && Array.isArray(thread.images) && thread.images.length > 0 && (
              <div
                className={`mt-3 grid gap-2 ${
                  thread.images.length === 1
                    ? 'grid-cols-1'
                    : thread.images.length === 2
                    ? 'grid-cols-2'
                    : thread.images.length === 3
                    ? 'grid-cols-3'
                    : 'grid-cols-2'
                }`}
              >
                {thread.images.map((image, index) => (
                  <div
                    key={index}
                    className="relative overflow-hidden rounded-lg border bg-muted cursor-zoom-in"
                    onClick={(e) => handleImageClick(e, index)}
                  >
                    <img
                      src={image.url || image}
                      alt={`Thread image ${index + 1}`}
                      className="w-full h-full object-cover aspect-square hover:opacity-90 transition-opacity"
                      onError={(e) => {
                        console.error('Image failed to load:', image);
                        e.target.style.display = 'none';
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-6 mt-3">
              {/* Like */}
              <button
                onClick={handleLike}
                className="flex items-center space-x-2 text-muted-foreground hover:text-red-500 transition-colors group"
              >
                <Heart
                  className={`h-5 w-5 ${
                    isLiked ? 'fill-red-500 text-red-500' : ''
                  } group-hover:scale-110 transition-transform`}
                />
                <span className="text-sm">{likesCount}</span>
              </button>

              {/* Comment */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (threadId) {
                    navigate(`/thread/${threadId}`);
                  }
                }}
                className="flex items-center space-x-2 text-muted-foreground hover:text-blue-500 transition-colors group"
              >
                <MessageCircle className="h-5 w-5 group-hover:scale-110 transition-transform" />
                <span className="text-sm">{thread.commentCount || 0}</span>
              </button>

              {/* Repost (placeholder) */}
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex items-center space-x-2 text-muted-foreground hover:text-green-500 transition-colors group"
              >
                <Repeat2 className="h-5 w-5 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxOpen && (
        <ImageLightbox
          images={imageUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}