import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';

import MobileBottomNav from '@/components/layout/MobileBottomNav';
import CreateThreadModal from '@/components/feed/CreateThreadModal';

export default function ProtectedLayout() {
  const [createOpen, setCreateOpen] = useState(false);

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
      <div className="min-h-screen bg-background pb-20 lg:pb-0">
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