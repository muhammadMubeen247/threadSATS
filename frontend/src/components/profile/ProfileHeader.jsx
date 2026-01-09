import { useEffect, useRef, useState } from 'react';
import { Camera, MapPin } from 'lucide-react';
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

export default function ProfileHeader({
  profile,
  isOwnProfile,
  onFollowToggle,
  onEditProfile,
  onProfilePicUpdated,
}) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [followError, setFollowError] = useState('');

  const [isUploadingPic, setIsUploadingPic] = useState(false);
  const [picError, setPicError] = useState('');
  const fileInputRef = useRef(null);

  // ✅ crop modal state
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState(''); // object URL
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  useEffect(() => {
    setIsFollowing(Boolean(profile?.isFollowing));
    setFollowersCount(Number(profile?.followersCount ?? 0));
  }, [profile?.isFollowing, profile?.followersCount]);

  const openPicPicker = () => {
    if (!isOwnProfile || isUploadingPic) return;
    setPicError('');
    fileInputRef.current?.click();
  };

  const onPickProfilePic = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPicError('');

    // preview and open crop modal
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
      form.append('image', file); // must match backend field name

      const res = await api.put('/users/me/profile-pic', form);

      const newUrl = res?.user?.profilePic;
      if (!newUrl) throw new Error('Upload succeeded but no profilePic returned.');

      onProfilePicUpdated?.(newUrl);
      closeCropModal();
    } catch (err) {
      setPicError(err?.message || 'Failed to upload profile picture');
    } finally {
      setIsUploadingPic(false);
    }
  };

  const handleFollowClick = async () => {
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

  // Ensure the component returns JSX (even a minimal placeholder)
  if (!profile) return null;

  return (
    <div className="border-b bg-card">
      {/* Cover Photo */}
      <div className="relative h-48 bg-gradient-to-r from-primary/20 to-primary/10">
        {profile?.coverPhoto && (
          <img src={profile.coverPhoto} alt="Cover" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Profile Info */}
      <div className="px-6 pb-6">
        {/* Avatar & Action Button */}
        <div className="flex justify-between items-start -mt-16 mb-4">
          <div className="relative">
            <Avatar className="w-32 h-32 border-4 border-background">
              <AvatarImage src={profile?.profilePic} className="object-cover" />
              <AvatarFallback className="text-2xl">
                {profile?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Hidden input */}
            {isOwnProfile && (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickProfilePic}
              />
            )}

            {/* Camera button */}
            {isOwnProfile && (
              <button
                type="button"
                onClick={openPicPicker}
                disabled={isUploadingPic}
                className="absolute bottom-0 right-0 p-2 bg-primary rounded-full hover:bg-primary/90 transition disabled:opacity-60"
                title="Update profile picture"
              >
                {isUploadingPic ? (
                  <span className="block h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            )}
          </div>

          {/* <div className="mt-4">
            {isOwnProfile ? (
              <Button variant="outline" type="button" onClick={onEditProfile}>
                Edit Profile
              </Button>
            ) : (
              <Button
                variant={isFollowing ? 'outline' : 'default'}
                onClick={handleFollowClick}
                disabled={isBusy}
                type="button"
              >
                {isBusy ? 'Please wait...' : isFollowing ? 'Following' : 'Follow'}
              </Button>
            )}
          </div> */}
        </div>
        

        {/* pic upload error */}
        {picError ? <p className="mb-3 text-sm text-red-500">{picError}</p> : null}

        {/* ✅ Crop modal */}
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
                  aspect={1} // ✅ square avatar
                  cropShape="round" // optional: round UI like avatars
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

        {/* User Info */}
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div>
              <h1 className="text-2xl font-bold">@{profile?.username}</h1>
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <MapPin className="w-4 h-4" />
                <span>
                  {profile?.department} • {profile?.batch}
                </span>
              </div>
            </div>

            {profile?.bio && <p className="text-sm">{profile.bio}</p>}

            <div className="flex gap-6 pt-2">
              <button className="hover:underline" type="button">
                <span className="font-bold">{followersCount}</span>
                <span className="text-muted-foreground ml-1">Followers</span>
              </button>
              <button className="hover:underline" type="button">
                <span className="font-bold">{profile?.followingCount}</span>
                <span className="text-muted-foreground ml-1">Following</span>
              </button>
              <div>
                <span className="font-bold">{profile?.threadsCount || 0}</span>
                <span className="text-muted-foreground ml-1">Threads</span>
              </div>
            </div>
          </div>
          <div className="mb-12">
            {isOwnProfile ? (
              <Button variant="outline" type="button" onClick={onEditProfile}>
                Edit Profile
              </Button>
            ) : (
              <Button
                variant={isFollowing ? 'outline' : 'default'}
                onClick={handleFollowClick}
                disabled={isBusy}
                type="button"
              >
                {isBusy ? 'Please wait...' : isFollowing ? 'Following' : 'Follow'}
              </Button>
            )}
          </div>
        </div>

        {followError ? <p className="mt-2 text-sm text-red-500">{followError}</p> : null}
      </div>
    </div>
  );
}