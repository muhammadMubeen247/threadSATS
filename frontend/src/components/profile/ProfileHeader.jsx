import { useEffect, useState } from 'react';
import { Camera, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/store/authStore'; // Changed

export default function ProfileHeader({ profile, isOwnProfile, onFollowToggle, onEditProfile }) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [followError, setFollowError] = useState('');

  useEffect(() => {
    setIsFollowing(Boolean(profile?.isFollowing));
    setFollowersCount(Number(profile?.followersCount ?? 0));
  }, [profile?.isFollowing, profile?.followersCount]);

  const handleFollowClick = async () => {
    if (!profile?.id || isBusy) return;

    setFollowError('');
    setIsBusy(true);

    const prevFollowing = isFollowing;
    const prevCount = followersCount;

    // optimistic update
    setIsFollowing(!prevFollowing);
    setFollowersCount(prevFollowing ? prevCount - 1 : prevCount + 1);

    try {
      await onFollowToggle(profile.id, prevFollowing);
    } catch (e) {
      // rollback + show error
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
          <img
            src={profile.coverPhoto}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        )}
        {isOwnProfile && (
          <button className="absolute top-4 right-4 p-2 bg-black/50 rounded-full hover:bg-black/70 transition">
            <Camera className="w-5 h-5 text-white" />
          </button>
        )}
      </div>

      {/* Profile Info */}
      <div className="px-6 pb-6">
        {/* Avatar & Action Button */}
        <div className="flex justify-between items-start -mt-16 mb-4">
          <div className="relative">
            <Avatar className="w-32 h-32 border-4 border-background">
              <AvatarImage src={profile?.profilePic} />
              <AvatarFallback className="text-2xl">
                {profile?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isOwnProfile && (
              <button className="absolute bottom-0 right-0 p-2 bg-primary rounded-full hover:bg-primary/90 transition">
                <Camera className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Action Button */}
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

        {/* User Info */}
        <div className="flex justify-between items-center">
            <div className="space-y-2">
            <div>
                <h1 className="text-2xl font-bold">@{profile?.username}</h1>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <MapPin className="w-4 h-4" />
                <span>{profile?.department} • {profile?.batch}</span>
                </div>
            </div>

            {/* Bio */}
            {profile?.bio && (
                <p className="text-sm">{profile.bio}</p>
            )}

            {/* Stats */}
            <div className="flex gap-6 pt-2">
                <button className="hover:underline">
                <span className="font-bold">{followersCount}</span>
                <span className="text-muted-foreground ml-1">Followers</span>
                </button>
                <button className="hover:underline">
                <span className="font-bold">{profile?.followingCount}</span>
                <span className="text-muted-foreground ml-1">Following</span>
                </button>
                <div>
                <span className="font-bold">{profile?.threadsCount || 0}</span>
                <span className="text-muted-foreground ml-1">Threads</span>
                </div>
            </div>
            </div>
            <div className="mt-4">
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
        {followError ? (
          <p className="mt-2 px-6 text-sm text-red-500">{followError}</p>
        ) : null}
      </div>
    </div>
  );
}