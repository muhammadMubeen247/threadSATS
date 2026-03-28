import { useLocation, useNavigate } from 'react-router-dom';
import { Home, TrendingUp, MessageCircle, Settings, Plus, Search, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import useScrollDirection from '@/hooks/useScrollDirection';

export default function MobileBottomNav({ onCreateThread }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const scrollDir = useScrollDirection();

  const profilePath = user ? '/me' : '/login';

  const isActive = (key, path) => {
    if (key === 'messages') return location.pathname.startsWith('/messages');
    if (key === 'trends') return location.pathname.startsWith('/trends');
    if (key === 'settings') return location.pathname.startsWith('/settings');
    if (key === 'search') return location.pathname.startsWith('/search');
    return location.pathname === path;
  };

  const items = [
    { key: 'home', label: 'Home', icon: Home, path: '/home' },
    { key: 'search', label: 'Search', icon: Search, path: '/search' }, // ✅ add
    { key: 'profile', label: 'Profile', icon: User, path: profilePath },

    {
      key: 'create',
      label: 'Create',
      icon: Plus,
      onClick: () => onCreateThread?.(),
      isCreate: true,
    },

    { key: 'messages', label: 'Messages', icon: MessageCircle, path: '/messages' },
    { key: 'trends', label: 'Trends', icon: TrendingUp, path: '/trends' },
    { key: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ];

  return (
    <div
      className={cn(
        'lg:hidden fixed bottom-0 left-0 right-0 z-50',
        'border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        'transition-transform duration-300',
        scrollDir === 'down' ? 'translate-y-full' : 'translate-y-0'
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto max-w-3xl px-3">
        <div className="flex items-center justify-between py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = item.path ? isActive(item.key, item.path) : false;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => (item.onClick ? item.onClick() : navigate(item.path))}
                aria-label={item.label}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 rounded-md py-2',
                  'text-muted-foreground hover:text-foreground',
                  active && 'text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center rounded-full',
                    item.isCreate ? 'h-11 w-11 bg-primary text-primary-foreground shadow' : 'h-9 w-9',
                    active && !item.isCreate && 'bg-accent'
                  )}
                >
                  <Icon className={cn(item.isCreate ? 'h-5 w-5' : 'h-5 w-5')} />
                </span>

                <span
                  className={cn('text-[11px] leading-none', item.isCreate && 'sr-only')}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}