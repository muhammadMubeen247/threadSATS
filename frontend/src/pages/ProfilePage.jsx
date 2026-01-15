import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import api from '@/api/axios';
import { useAuthStore } from '@/store/authStore';
import ProfileHeader from '@/components/profile/ProfileHeader';
import EditProfileModal from '@/components/profile/EditProfileModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ThreadsTab from '@/components/profile/ThreadsTab';
import RepliesTab from '@/components/profile/RepliesTab';
import LikesTab from '@/components/profile/LikesTab';
// import MediaTab from '@/components/profile/MediaTab';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';

export default function ProfilePage() {
  const { handle } = useParams(); // "/@mubeen" => handle = "@mubeen"
  const navigate = useNavigate();

  const authStore = useAuthStore();
  const { user: currentUser, isAuthenticated } = authStore;

  const username = useMemo(() => {
    if (!handle) return '';
    return handle.startsWith('@') ? handle.slice(1) : '';
  }, [handle]);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await api.get(`/users/${username}/profile`);
        setProfile(res.user);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    if (username) fetchProfile();
  }, [username]);

  if (!handle?.startsWith('@')) {
    return <Navigate to="/home" replace />;
  }

  const currentUserId = currentUser?._id || currentUser?.id;
  const profileUserId = profile?._id || profile?.id;
  const isOwnProfile = Boolean(
    currentUserId && profileUserId && String(currentUserId) === String(profileUserId)
  );

  const handleFollowToggle = async (u, isCurrentlyFollowing) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    try {
      if (isCurrentlyFollowing) {
        await api.delete(`/users/${u}/unfollow`);
      } else {
        await api.post(`/users/${u}/follow`);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Follow action failed';
      throw new Error(msg);
    }
  };

  const handleProfilePicUpdated = (newUrl) => {
    setProfile((prev) => (prev ? { ...prev, profilePic: newUrl } : prev));

    // keep navbar/avatar in sync if store exposes helpers
    if (isOwnProfile && typeof authStore.setUser === 'function') {
      authStore.setUser({ ...currentUser, profilePic: newUrl });
    }
    if (isOwnProfile && typeof authStore.updateUser === 'function') {
      authStore.updateUser({ profilePic: newUrl });
    }
  };

  const handleProfileUpdated = (patch) => {
    if (!patch) return;

    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));

    // keep auth store (navbar avatar etc.) in sync if helpers exist
    if (isOwnProfile && typeof authStore.updateUser === 'function') {
      authStore.updateUser(patch);
    } else if (isOwnProfile && typeof authStore.setUser === 'function') {
      authStore.setUser({ ...currentUser, ...patch });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <button onClick={() => navigate(-1)} className="text-primary hover:underline">
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto flex flex-col lg:flex-row">
        {/* Left Sidebar (desktop only) */}
        <aside className="hidden lg:block w-64 shrink-0">
          <Sidebar onCreateThread={() => navigate('/home')} />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-[calc(100vh-4rem)] lg:border-x">
          <ProfileHeader
            profile={profile}
            isOwnProfile={isOwnProfile}
            onFollowToggle={handleFollowToggle}
            onEditProfile={() => setIsEditOpen(true)} // ✅ open modal
            onProfilePicUpdated={handleProfilePicUpdated}
          />

          <EditProfileModal
            open={isEditOpen}
            onClose={() => setIsEditOpen(false)}
            profile={profile}
            onUpdated={handleProfileUpdated}
          />

          <Tabs defaultValue="threads" className="mt-4">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger
                value="threads"
                className="flex-1 sm:flex-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 sm:px-6 py-3"
              >
                Threads
              </TabsTrigger>
              <TabsTrigger
                value="replies"
                className="flex-1 sm:flex-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 sm:px-6 py-3"
              >
                Replies
              </TabsTrigger>
              <TabsTrigger
                value="likes"
                className="flex-1 sm:flex-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 sm:px-6 py-3"
              >
                Likes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="threads" className="mt-0">
              <ThreadsTab userId={profile?.id} />
            </TabsContent>
            <TabsContent value="replies" className="mt-0">
              <RepliesTab userId={profile?.id} />
            </TabsContent>
            <TabsContent value="likes" className="mt-0">
              <LikesTab userId={profile?.id} />
            </TabsContent>
          </Tabs>
        </main>

        {/* Right Sidebar (xl+ only) */}
        <aside className="hidden xl:block w-80 shrink-0">
          <SuggestedUsers />
        </aside>
      </div>
    </div>
  );
}