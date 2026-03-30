import { useEffect, useRef, useState } from 'react';
import { Camera, MapPin, InfoIcon, MessageCircle, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import api from '@/api/axios';
import Cropper from 'react-easy-crop';
import { getCroppedBlob } from '@/utils/cropImage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useLocation, useNavigate } from 'react-router-dom';
import EditProfileModal from '@/components/profile/EditProfileModal';
import PersonaConnectionsModal from '@/components/profile/PersonaConnectionsModal';
import { useAuthStore } from '@/store/authStore';

export default function ProfileHeader(props) {
  const { profile, onFollowToggle, onProfilePicUpdated } = props;

  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [followError, setFollowError] = useState('');

  // ✅ block state
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState('');
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const [confirmUnblockOpen, setConfirmUnblockOpen] = useState(false);

  // ✅ actions dropdown (simple custom)
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef(null);

  // ✅ DM state
  const [isDmBusy, setIsDmBusy] = useState(false);
  const [dmError, setDmError] = useState('');

  const [isUploadingPic, setIsUploadingPic] = useState(false);
  const [picError, setPicError] = useState('');
  const fileInputRef = useRef(null);

  // ✅ crop modal state
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(''); // object URL
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [isEditOpen, setIsEditOpen] = useState(false);

  // ✅ connections modal state
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsMode, setConnectionsMode] = useState('followers');

  const navigate = useNavigate();
  const location = useLocation();

  // ✅ active persona mode (public/anon)
  const activeMode = useAuthStore((s) => s.activeMode);

  useEffect(() => {
    setIsFollowing(Boolean(profile?.isFollowing));
    setFollowersCount(Number(profile?.followersCount ?? 0));
    setIsBlocked(Boolean(profile?.isBlocked)); // ✅
  }, [profile?.isFollowing, profile?.followersCount, profile?.isBlocked]);

  // close actions dropdown on outside click / escape
  useEffect(() => {
    if (!actionsOpen) return;

    const onDown = (e) => {
      if (e.key === 'Escape') setActionsOpen(false);
    };
    const onClick = (e) => {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(e.target)) setActionsOpen(false);
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('mousedown', onClick);
    };
  }, [actionsOpen]);

  // ✅ derive edit permissions from backend
  const isActivePersona = Boolean(profile?.isActivePersona);

  // ✅ DM allowed only between same persona types + not blocked
  const activeType = activeMode === 'anon' ? 'anon' : 'public';
  const canMessage =
    !isActivePersona &&
    !isBlocked &&
    Boolean(profile?.username) &&
    Boolean(profile?.type) &&
    profile.type === activeType;

  const targetHandle = String(profile?.username || profile?.handle || '').trim();

  const handleMessageClick = async () => {
    if (!canMessage || isDmBusy) return;

    setDmError('');
    setIsDmBusy(true);
    try {
      const res = await api.post('/dm/conversations', {
        targetHandle: profile.username,
      });

      const id = res?.conversation?.id;
      if (!id) throw new Error('Could not start conversation');

      navigate(`/messages/${id}`);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.userMessage || e?.message || 'Failed to start chat';
      setDmError(msg);
    } finally {
      setIsDmBusy(false);
    }
  };

  const openPicPicker = () => {
    if (!isActivePersona || isUploadingPic) return;
    setPicError('');
    fileInputRef.current?.click();
  };

  const onPickProfilePic = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPicError('');

    const objectUrl = URL.createObjectURL(file);
    setImageSrc(objectUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsCropOpen(true);
  };

  const onCropComplete = (_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  };

  const closeCropModal = () => {
    setIsCropOpen(false);
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc('');
  };

  const uploadCropped = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setIsUploadingPic(true);
    setPicError('');

    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, 'image/jpeg', 0.92);
      const file = new File([blob], 'profile.jpg', { type: 'image/jpeg' });

      const form = new FormData();
      form.append('image', file);

      const res = await api.put('/users/me/profile-pic', form);

      const newUrl = res?.user?.profilePic;
      if (!newUrl) throw new Error('Upload succeeded but no profilePic returned.');

      onProfilePicUpdated?.(newUrl);
      closeCropModal();
    } catch (err) {
      setPicError(err?.userMessage || err?.message || 'Failed to upload profile picture');
    } finally {
      setIsUploadingPic(false);
    }
  };

  const doBlock = async () => {
    if (!targetHandle || blockBusy) return;

    setBlockError('');
    setBlockBusy(true);
    try {
      await api.post(`/personas/${targetHandle}/block`);

      // reflect immediately
      if (isFollowing) {
        setIsFollowing(false);
        setFollowersCount((c) => Math.max(0, Number(c || 0) - 1));
      }
      setIsBlocked(true);

      setConfirmBlockOpen(false);
      setActionsOpen(false);
    } catch (e) {
      setBlockError(e?.response?.data?.message || e?.message || 'Failed to block');
    } finally {
      setBlockBusy(false);
    }
  };

  const doUnblock = async () => {
    if (!targetHandle || blockBusy) return;

    setBlockError('');
    setBlockBusy(true);
    try {
      await api.delete(`/personas/${targetHandle}/block`);
      setIsBlocked(false);
      setConfirmUnblockOpen(false);
    } catch (e) {
      setBlockError(e?.response?.data?.message || e?.message || 'Failed to unblock');
    } finally {
      setBlockBusy(false);
    }
  };

  const handleFollowClick = async () => {
    // ✅ Follow button becomes Unblock when blocked
    if (isBlocked) {
      setConfirmUnblockOpen(true);
      return;
    }

    if (!profile?.id || isBusy) return;

    setFollowError('');
    setIsBusy(true);

    const prevFollowing = isFollowing;
    const prevCount = followersCount;

    setIsFollowing(!prevFollowing);
    setFollowersCount(prevFollowing ? prevCount - 1 : prevCount + 1);

    try {
      await onFollowToggle(profile.id, prevFollowing);
    } catch (e) {
      setIsFollowing(prevFollowing);
      setFollowersCount(prevCount);
      setFollowError(e?.message || 'Follow failed');
    } finally {
      setIsBusy(false);
    }
  };

  const handleProfileUpdated = (patch) => {
    props?.onProfileUpdated?.(patch);

    if (patch?.username && typeof patch.username === 'string') {
      const newHandle = patch.username.trim();
      if (newHandle && location.pathname.startsWith('/@')) {
        navigate(`/@${newHandle}`, { replace: true });
      }
    }
  };

  if (!profile) return null;

  const openFollowers = () => {
    setConnectionsMode('followers');
    setConnectionsOpen(true);
  };

  const openFollowing = () => {
    setConnectionsMode('following');
    setConnectionsOpen(true);
  };

  return (
    <>
      <div className="border-b bg-card">
        <div className="relative h-32 sm:h-40 md:h-48 overflow-hidden bg-gradient-to-r from-primary/20 to-primary/10">
          {profile?.coverPhoto ? (
            <img
              src={profile.coverPhoto}
              alt="Cover"
              className="absolute inset-0 w-full h-full object-cover object-center"
              loading="lazy"
            />
          ) : null}
          <div className="absolute inset-0 bg-black/10" />
        </div>

        <div className="px-6 pb-6">
          <div className="flex justify-between items-start -mt-16 mb-4">
            <div className="relative">
              <Avatar className="w-32 h-32 border-4 border-background">
                <AvatarImage src={profile?.profilePic} className="object-cover" />
                <AvatarFallback className="text-2xl">
                  {profile?.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>

              {isActivePersona && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickProfilePic}
                />
              )}
            </div>
          </div>

          {picError ? <p className="mb-3 text-sm text-red-500">{picError}</p> : null}

          <Dialog open={isCropOpen} onOpenChange={(open) => (!open ? closeCropModal() : null)}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Adjust profile picture</DialogTitle>
              </DialogHeader>

              <div className="relative w-full h-[360px] bg-black/90 rounded-md overflow-hidden">
                {imageSrc ? (
                  <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={onCropComplete}
                  />
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Zoom</span>
                <input
                  className="w-full"
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeCropModal} disabled={isUploadingPic}>
                  Cancel
                </Button>
                <Button type="button" onClick={uploadCropped} disabled={isUploadingPic || !croppedAreaPixels}>
                  {isUploadingPic ? 'Uploading…' : 'Save'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="space-y-2 min-w-0">
              <div>
                <h1 className="text-2xl font-bold truncate">@{profile?.username}</h1>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <span>{profile?.rollNumber}</span>
                </div>
              </div>

              {profile?.bio && <p className="text-sm">{profile.bio}</p>}

              <div className="flex gap-6 pt-2">
                <button className="hover:underline" type="button" onClick={openFollowers}>
                  <span className="font-bold">{followersCount}</span>
                  <span className="text-muted-foreground ml-1">Followers</span>
                </button>

                <button className="hover:underline" type="button" onClick={openFollowing}>
                  <span className="font-bold">{profile?.followingCount}</span>
                  <span className="text-muted-foreground ml-1">Following</span>
                </button>

                <div>
                  <span className="font-bold">{profile?.threadsCount || 0}</span>
                  <span className="text-muted-foreground ml-1">Threads</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isActivePersona ? (
                <Button variant="outline" type="button" onClick={() => setIsEditOpen(true)}>
                  Edit Profile
                </Button>
              ) : (
                <>
                  <Button
                    variant={isBlocked ? 'destructive' : (isFollowing ? 'outline' : 'default')}
                    onClick={handleFollowClick}
                    disabled={isBusy || blockBusy}
                    type="button"
                  >
                    {blockBusy ? 'Please wait...' : isBlocked ? 'Unblock' : isBusy ? 'Please wait...' : isFollowing ? 'Following' : 'Follow'}
                  </Button>

                  {/* ✅ Dropdown next to Follow (only when NOT blocked) */}
                  {!isBlocked ? (
                    <div className="relative" ref={actionsRef}>
                      <Button
                        type="button"
                        size="icon"
                        onClick={() => setActionsOpen((v) => !v)}
                        aria-haspopup="menu"
                        aria-expanded={actionsOpen}
                        title="More"
                        className={[
                          'h-10 w-10 rounded-full',
                          'bg-primary text-primary-foreground',
                          'hover:bg-primary/90',
                          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          'shadow-sm transition',
                        ].join(' ')}
                      >
                        <MoreVertical className="h-5 w-5" />
                      </Button>

                      {actionsOpen ? (
                        <div className="absolute right-0 mt-2 w-44 rounded-md border bg-background shadow-md z-50 overflow-hidden">
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-red-600"
                            onClick={() => {
                              setActionsOpen(false);
                              setConfirmBlockOpen(true);
                            }}
                          >
                            Block @{profile?.username}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* ✅ Message button */}
                  {canMessage ? (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleMessageClick}
                      disabled={isDmBusy || blockBusy}
                      type="button"
                      className="h-10 w-10 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition"
                      title="Send message"
                    >
                      {isDmBusy ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                      ) : (
                        <MessageCircle className="h-5 w-5" />
                      )}
                    </Button>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {followError ? <p className="mt-2 text-sm text-red-500">{followError}</p> : null}
          {dmError ? <p className="mt-2 text-sm text-red-500">{dmError}</p> : null}
          {blockError ? <p className="mt-2 text-sm text-red-500">{blockError}</p> : null}
        </div>
      </div>

      {/* ✅ Confirm Block */}
      <Dialog open={confirmBlockOpen} onOpenChange={setConfirmBlockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Block @{profile?.username}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You won’t be able to view this profile again unless you unblock.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmBlockOpen(false)} disabled={blockBusy}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={doBlock} disabled={blockBusy}>
              {blockBusy ? 'Blocking…' : 'Block'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ Confirm Unblock */}
      <Dialog open={confirmUnblockOpen} onOpenChange={setConfirmUnblockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unblock @{profile?.username}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You’ll be able to view this profile again.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmUnblockOpen(false)} disabled={blockBusy}>
              Cancel
            </Button>
            <Button type="button" onClick={doUnblock} disabled={blockBusy}>
              {blockBusy ? 'Unblocking…' : 'Unblock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditProfileModal
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        profile={profile}
        onUpdated={handleProfileUpdated}
      />

      <PersonaConnectionsModal
        open={connectionsOpen}
        onOpenChange={setConnectionsOpen}
        handle={profile?.username}
        mode={connectionsMode}
      />
    </>
  );
}