import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import api from '@/api/axios';
import { useAuthStore } from '@/store/authStore';
import ProfileHeader from '@/components/profile/ProfileHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ThreadsTab from '@/components/profile/ThreadsTab';
import RepliesTab from '@/components/profile/RepliesTab';
import LikesTab from '@/components/profile/LikesTab';
import MediaTab from '@/components/profile/MediaTab';

export default function ProfilePage() {
  const { handle } = useParams(); // "/@mubeen" => handle = "@mubeen"
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();

  const username = useMemo(() => {
    if (!handle) return '';
    return handle.startsWith('@') ? handle.slice(1) : '';
  }, [handle]);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/users/${username}/profile`);
        setProfile(res.user);
      } catch (err) {
        setError(err?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    if (username) fetchProfile();
  }, [username]);

  // If someone visits "/home" etc, those routes win. If they visit "/abc" (no @), show 404-ish behavior.
  if (!handle?.startsWith('@')) {
    return <Navigate to="/home" replace />;
  }

  const handleFollowToggle = async (u, isCurrentlyFollowing) => {
    if (isCurrentlyFollowing) await api.delete(`/users/${u}/unfollow`);
    else await api.post(`/users/${u}/follow`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={() => navigate(-1)} className="text-primary hover:underline">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUser?._id === profile?.id;

  return (
    <div className="max-w-5xl mx-auto">
      <ProfileHeader profile={profile} isOwnProfile={isOwnProfile} onFollowToggle={handleFollowToggle} />

      <Tabs defaultValue="threads" className="mt-4">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
          <TabsTrigger value="threads" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-6 py-3">
            Threads
          </TabsTrigger>
          <TabsTrigger value="replies" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-6 py-3">
            Replies
          </TabsTrigger>
          <TabsTrigger value="likes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-6 py-3">
            Likes
          </TabsTrigger>
          <TabsTrigger value="media" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-6 py-3">
            Media
          </TabsTrigger>
        </TabsList>

        <TabsContent value="threads" className="mt-0">
          <ThreadsTab username={username} />
        </TabsContent>
        <TabsContent value="replies" className="mt-0">
          <RepliesTab username={username} />
        </TabsContent>
        <TabsContent value="likes" className="mt-0">
          <LikesTab username={username} />
        </TabsContent>
        <TabsContent value="media" className="mt-0">
          <MediaTab username={username} />
        </TabsContent>
      </Tabs>
    </div>
  );
}