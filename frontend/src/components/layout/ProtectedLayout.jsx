import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import MobileBottomNav from '@/components/layout/MobileBottomNav';
import CreateThreadModal from '@/components/feed/CreateThreadModal';

export default function ProtectedLayout() {
  const location = useLocation();
  const [createOpen, setCreateOpen] = useState(false);

  // Suppress bottom padding when a DM conversation is open — chat is full-screen
  const inChat = /^\/messages\/.+/.test(location.pathname);

  // ✅ allow any component to open the modal by dispatching:
  // window.dispatchEvent(new Event('thread:create'))
  useEffect(() => {
    const onOpen = () => setCreateOpen(true);
    window.addEventListener('thread:create', onOpen);
    return () => window.removeEventListener('thread:create', onOpen);
  }, []);

  return (
    <>
      {/* Page content gets bottom padding so it doesn't go under the nav */}
      <div className={`min-h-screen bg-background lg:pb-0 ${inChat ? '' : 'pb-20'}`}>
        <Outlet />
      </div>

      {/* Global create modal */}
      <CreateThreadModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onThreadCreated={(thread) => {
          try {
            window.dispatchEvent(new CustomEvent('thread:created', { detail: thread }));
          } catch {
            // ignore
          }
        }}
      />

      {/* Mobile bottom nav */}
      <MobileBottomNav onCreateThread={() => setCreateOpen(true)} />
    </>
  );
}