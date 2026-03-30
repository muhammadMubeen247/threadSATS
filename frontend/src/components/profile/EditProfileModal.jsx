import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { X, Camera } from 'lucide-react';

import api from '@/api/axios';
import { getCroppedBlob } from '@/utils/cropImage';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function revoke(url) {
  try {
    if (url) URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

export default function EditProfileModal({ open, onClose, profile, onUpdated }) {
  // Text fields
  const initialUsername = useMemo(() => profile?.username ?? '', [profile?.username]);
  const initialBio = useMemo(() => profile?.bio ?? '', [profile?.bio]);

  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');

  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // File inputs
  const profileInputRef = useRef(null);
  const coverInputRef = useRef(null);

  // Crop modal state (used for BOTH avatar + cover)
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState(null); // "profile" | "cover" | null
  const [cropSrc, setCropSrc] = useState(''); // object URL

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [cropError, setCropError] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const isBusy = isSaving || isUploadingImage;

  useEffect(() => {
    if (!open) return;

    setUsername(initialUsername);
    setBio(initialBio);
    setSaveError('');

    // reset crop state
    setIsCropOpen(false);
    setCropTarget(null);
    setCropError('');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);

    revoke(cropSrc);
    setCropSrc('');
  }, [open, initialUsername, initialBio]);

  useEffect(() => {
    return () => {
      revoke(cropSrc);
    };
  }, [cropSrc]);

  const close = () => {
    if (isBusy) return;
    revoke(cropSrc);
    setCropSrc('');
    setIsCropOpen(false);
    setCropTarget(null);
    onClose?.();
  };

  // ---------- pickers ----------
  const openProfilePicker = () => {
    if (isBusy) return;
    profileInputRef.current?.click();
  };

  const openCoverPicker = () => {
    if (isBusy) return;
    coverInputRef.current?.click();
  };

  const openCropModalForFile = (file, target) => {
    if (!file) return;

    setCropError('');
    setCropTarget(target);

    // reset crop params each time
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);

    revoke(cropSrc);
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setIsCropOpen(true);
  };

  const onPickProfileFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    openCropModalForFile(file, 'profile');
  };

  const onPickCoverFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    openCropModalForFile(file, 'cover');
  };

  const closeCrop = () => {
    if (isUploadingImage) return;
    setIsCropOpen(false);
    setCropTarget(null);
    setCropError('');
    revoke(cropSrc);
    setCropSrc('');
  };

  // ---------- crop + upload ----------
  const cropAspect = cropTarget === 'cover' ? 3 / 1 : 1;
  const cropShape = cropTarget === 'cover' ? 'rect' : 'round';

  const saveCroppedImage = async () => {
    if (!cropSrc || !croppedAreaPixels || !cropTarget) return;

    setIsUploadingImage(true);
    setCropError('');

    try {
      const blob = await getCroppedBlob(cropSrc, croppedAreaPixels, 'image/jpeg', 0.92);

      const filename = cropTarget === 'cover' ? 'cover.jpg' : 'profile.jpg';
      const file = new File([blob], filename, { type: 'image/jpeg' });

      const form = new FormData();
      form.append('image', file); // backend expects "image"

      // ✅ persona endpoints
      const endpoint = cropTarget === 'cover' ? '/personas/me/cover-photo' : '/personas/me/profile-pic';
      const res = await api.put(endpoint, form);

      // ✅ axios wrapper returns data directly
      const newUrl = cropTarget === 'cover' ? res?.coverPhoto : res?.profilePic;
      if (!newUrl) throw new Error('Upload succeeded but no image URL returned.');

      onUpdated?.(cropTarget === 'cover' ? { coverPhoto: newUrl } : { profilePic: newUrl });

      closeCrop();
    } catch (err) {
      setCropError(err?.response?.data?.message || err?.message || 'Failed to upload image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // ---------- save text fields ----------
  const saveTextFields = async () => {
    if (isBusy) return;

    setIsSaving(true);
    setSaveError('');

    try {
      const patch = {};

      const nextUsername = (username || '').trim().toLowerCase();
      const nextBio = (bio ?? '').trimEnd();

      // Basic client-side checks (server will still validate)
      if (!nextUsername) throw new Error('Username is required.');
      if (nextUsername.length < 3 || nextUsername.length > 20) {
        throw new Error('Username must be between 3 and 20 characters.');
      }
      if (!/^[a-z0-9_]+$/.test(nextUsername)) {
        throw new Error('Username can only contain lowercase letters, numbers, and underscores.');
      }
      if (nextBio.length > 150) throw new Error('Bio cannot exceed 150 characters.');

      // Only call endpoints if changed
      if (nextUsername !== initialUsername) {
        // ✅ persona handle update
        const r1 = await api.put('/personas/me/handle', { handle: nextUsername });
        patch.username = r1?.persona?.handle ?? nextUsername; // keep "username" in UI = handle
      }

      if ((nextBio || '') !== (initialBio || '')) {
        const r2 = await api.put('/personas/me/bio', { bio: nextBio });
        patch.bio = typeof r2?.bio === 'string' ? r2.bio : nextBio;
      }

      if (Object.keys(patch).length) onUpdated?.(patch);
      close();
    } catch (err) {
      setSaveError(err?.response?.data?.message || err?.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <>
      {/* Main "Edit profile" modal (full-screen on mobile) */}
      <Dialog open={open} onOpenChange={(v) => (!v ? close() : null)}>
        <DialogContent hideClose className="p-0 w-[100vw] max-w-none h-[calc(100dvh-2rem)] my-4 rounded-none sm:h-auto sm:max-w-xl sm:rounded-lg overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
            <Button type="button" variant="ghost" size="icon" onClick={close} disabled={isBusy}>
              <X className="h-5 w-5" />
            </Button>

            <div className="font-semibold">Edit profile</div>

            <Button type="button" onClick={saveTextFields} disabled={isBusy}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-5 overflow-auto max-h-[calc(100dvh-56px)]">
            {saveError ? <p className="text-sm text-red-500">{saveError}</p> : null}

            {/* Cover */}
            <div className="relative h-40 sm:h-48 rounded-lg overflow-hidden bg-black/90">
              {profile?.coverPhoto ? (
                <img
                  src={profile.coverPhoto}
                  alt="Cover"
                  className="absolute inset-0 w-full h-full object-cover object-center opacity-90"
                />
              ) : null}

              <div className="absolute inset-0 bg-black/25" />

              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                onClick={openCoverPicker}
                disabled={isBusy}
                title="Change cover photo"
              >
                <Camera className="h-5 w-5" />
              </Button>

              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickCoverFile}
                disabled={isBusy}
              />
            </div>

            {/* Avatar row */}
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <div className="h-20 w-20 rounded-full overflow-hidden bg-muted border">
                  {profile?.profilePic ? (
                    <img
                      src={profile.profilePic}
                      alt="Profile"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                      {profile?.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute -bottom-2 -right-2 rounded-full"
                  onClick={openProfilePicker}
                  disabled={isBusy}
                  title="Change profile picture"
                >
                  <Camera className="h-4 w-4" />
                </Button>

                <input
                  ref={profileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickProfileFile}
                  disabled={isBusy}
                />
              </div>

              <div className="flex-1 min-w-0">
                <DialogHeader className="sr-only">
                  <DialogTitle>Edit profile</DialogTitle>
                </DialogHeader>

                {/* <p className="text-sm text-muted-foreground">
                  Update your photo, cover and bio.
                </p> */}
              </div>
            </div>

            {/* Username */}
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Name</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isBusy}
                placeholder="Username"
              />
              <p className="text-xs text-muted-foreground">
                3–20 chars. Lowercase letters, numbers, underscore.
              </p>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Bio</label>
                <span className="text-xs text-muted-foreground">{(bio || '').length}/150</span>
              </div>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                disabled={isBusy}
                maxLength={150}
                className="min-h-[120px] resize-none"
                placeholder="Tell people about yourself…"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Crop modal (opens after selecting profile/cover image) */}
      <Dialog open={isCropOpen} onOpenChange={(v) => (!v ? closeCrop() : null)}>
        <DialogContent className="max-w-xl">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {cropTarget === 'cover' ? 'Adjust cover photo' : 'Adjust profile picture'}
            </h3>
            <Button type="button" variant="ghost" size="icon" onClick={closeCrop} disabled={isUploadingImage}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {cropError ? <p className="text-sm text-red-500">{cropError}</p> : null}

          <div className="relative w-full h-[360px] bg-black/90 rounded-md overflow-hidden">
            {cropSrc ? (
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={cropAspect}
                cropShape={cropShape}
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
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
              disabled={isUploadingImage}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={closeCrop} disabled={isUploadingImage}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveCroppedImage}
              disabled={isUploadingImage || !croppedAreaPixels}
            >
              {isUploadingImage ? 'Uploading…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}