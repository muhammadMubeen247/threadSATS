import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import Sidebar from '@/components/layout/Sidebar';
import SuggestedUsers from '@/components/layout/SuggestedUsers';
import ThreadCard from '@/components/feed/ThreadCard';
import CreateThreadModal from '@/components/feed/CreateThreadModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import useAuthStore from '@/store/authStore';
import api from '@/api/axios';

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [activeTab, setActiveTab] = useState('forYou');
  const [threads, setThreads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Fetch threads based on active tab
  useEffect(() => {
    fetchThreads();
  }, [activeTab]);

  const fetchThreads = async () => {
    setIsLoading(true);
    try {
      let endpoint = '/threads';
      if (activeTab === 'following') {
        endpoint = '/threads/feed/following';
      }
      // 'yourBatch' uses same endpoint as 'forYou' for now

      const response = await api.get(endpoint);
      
      // Debug: Log response structure
      console.log('API Response:', response);
      console.log('Threads:', response.threads);
      
      setThreads(response.threads || []);
    } catch (error) {
      console.error('Failed to fetch threads:', error);
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleThreadCreated = (newThread) => {
    setThreads([newThread, ...threads]);
  };

  const handleThreadDeleted = (threadId) => {
    setThreads(threads.filter((t) => (t._id || t.id) !== threadId));
  };

  const renderThreads = () => {
    if (isLoading) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          Loading threads...
        </div>
      );
    }

    if (threads.length === 0) {
      const emptyMessage =
        activeTab === 'following'
          ? 'You are not following anyone.'
          : 'Nothing to see here :(';
      return (
        <div className="p-8 text-center text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }

    return threads.map((thread) => (
      <ThreadCard
        key={thread._id || thread.id}
        thread={thread}
        onDelete={handleThreadDeleted}
      />
    ));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto flex">
        {/* Left Sidebar */}
        <Sidebar onCreateThread={() => setShowCreateModal(true)} />

        {/* Main Feed */}
        <main className="flex-1 border-x min-h-screen">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-background p-0 h-14">
              <TabsTrigger
                value="forYou"
                className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
              >
                For You
              </TabsTrigger>
              <TabsTrigger
                value="following"
                className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
              >
                Following
              </TabsTrigger>
              <TabsTrigger
                value="yourBatch"
                className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
              >
                Your Batch
              </TabsTrigger>
            </TabsList>

            <TabsContent value="forYou" className="mt-0">
              {renderThreads()}
            </TabsContent>

            <TabsContent value="following" className="mt-0">
              {renderThreads()}
            </TabsContent>

            <TabsContent value="yourBatch" className="mt-0">
              {renderThreads()}
            </TabsContent>
          </Tabs>
        </main>

        {/* Right Sidebar */}
        <SuggestedUsers />
      </div>

      {/* Create Thread Modal */}
      <CreateThreadModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onThreadCreated={handleThreadCreated}
      />
    </div>
  );
}