import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import api from '@/api/axios';
import { useAuthStore } from '@/store/authStore';
import ProfileHeader from '@/components/profile/ProfileHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';

// ✅ new persona tabs
import PersonaThreadsTab from '@/components/profile/PersonaThreadsTab';
import PersonaRepliesTab from '@/components/profile/PersonaRepliesTab';
import PersonaLikesTab from '@/components/profile/PersonaLikesTab';

export default function ProfilePage() {
  const { handle } = useParams(); // "/@hanekawa" => handle = "@hanekawa"
  const navigate = useNavigate();

  const { isAuthenticated } = useAuthStore();

  const personaHandle = useMemo(() => {
    if (!handle) return '';
    return handle.startsWith('@') ? handle.slice(1).trim().toLowerCase() : '';
  }, [handle]);

  const [profile, setProfile] = useState(null); // will hold persona profile object
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPersonaProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.get(`/personas/${personaHandle}/profile`);
        // backend returns: { success, persona: {...} }
        setProfile(res.persona);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    if (personaHandle) fetchPersonaProfile();
  }, [personaHandle]);

  if (!handle?.startsWith('@')) {
    return <Navigate to="/home" replace />;
  }

  const isOwnProfile = Boolean(profile?.isOwnProfile);

  const handleFollowToggle = async (_ignored, isCurrentlyFollowing) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const targetHandle = profile?.handle || profile?.username;
    if (!targetHandle) throw new Error('Invalid profile handle');

    try {
      if (isCurrentlyFollowing) {
        await api.delete(`/personas/${targetHandle}/follow`);
      } else {
        await api.post(`/personas/${targetHandle}/follow`);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Follow action failed';
      throw new Error(msg);
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

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto flex flex-col lg:flex-row">
        <aside className="hidden lg:block w-64 shrink-0">
          <Sidebar onCreateThread={() => navigate('/home')} />
        </aside>

        <main className="flex-1 min-h-[calc(100vh-4rem)] lg:border-x">
          <ProfileHeader
            profile={profile}
            isOwnProfile={isOwnProfile}
            onFollowToggle={handleFollowToggle}
            // ✅ editing should happen via /me (active persona)
            onEditProfile={() => navigate('/me')}
            onProfilePicUpdated={() => {}}
          />

          <Tabs defaultValue="threads" className="mt-4">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger value="threads" className="flex-1 sm:flex-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 sm:px-6 py-3">
                Threads
              </TabsTrigger>
              <TabsTrigger value="replies" className="flex-1 sm:flex-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 sm:px-6 py-3">
                Replies
              </TabsTrigger>
              <TabsTrigger value="likes" className="flex-1 sm:flex-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-4 sm:px-6 py-3">
                Likes
              </TabsTrigger>
            </TabsList>

            <TabsContent value="threads" className="mt-0">
              <PersonaThreadsTab handle={profile.handle} />
            </TabsContent>
            <TabsContent value="replies" className="mt-0">
              <PersonaRepliesTab handle={profile.handle} />
            </TabsContent>
            <TabsContent value="likes" className="mt-0">
              <PersonaLikesTab handle={profile.handle} />
            </TabsContent>
          </Tabs>
        </main>

        <aside className="hidden xl:block w-80 shrink-0">
          <SuggestedUsers />
        </aside>
      </div>
    </div>
  );
}