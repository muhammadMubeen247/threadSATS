import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  User,
  Search,
  Settings,
  PlusCircle,
  MessageCircle,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useNotificationsStore } from '@/store/notificationsStore';

export default function Sidebar({ onCreateThread, onNavigate, className }) {
  const location = useLocation();
  const { user } = useAuthStore();
  const { unreadDmCount } = useNotificationsStore();

  const profilePath = user ? '/me' : '/login';

  const navItems = [
    { name: 'Home', icon: Home, path: '/home' },
    { name: 'Search', icon: Search, path: '/search' }, // ✅ add
    { name: 'Profile', icon: User, path: profilePath },
    { name: 'Messages', icon: MessageCircle, path: '/messages' },
    { name: 'Trends', icon: TrendingUp, path: '/trends' },
    { name: 'Settings', icon: Settings, path: '/settings' },
  ];

  return (
    <aside
      className={cn(
        'sticky top-16 h-[calc(100vh-4rem)] w-64 border-r bg-background p-4',
        className
      )}
    >
      <nav className="space-y-2">
        {onCreateThread !== undefined ? (
          <Button
            onClick={() => {
              onCreateThread?.();
              onNavigate?.();
            }}
            className="w-full justify-start"
            size="lg"
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            Create Thread
          </Button>
        ) : (
          <Button
            onClick={() => {
              window.dispatchEvent(new Event('thread:create'));
              onNavigate?.();
            }}
            className="w-full justify-start"
            size="lg"
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            Create Thread
          </Button>
        )}

        {navItems.map((item) => {
          const Icon = item.icon;

          const isActive =
            location.pathname === item.path ||
            (item.path === '/messages' && location.pathname.startsWith('/messages')) ||
            (item.path === '/trends' && location.pathname.startsWith('/trends'));

          return (
            <Link key={item.path} to={item.path} onClick={onNavigate}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn('w-full justify-start', isActive && 'bg-secondary')}
                size="lg"
              >
                <Icon className="mr-2 h-5 w-5" />
                {item.name}
                {item.name === 'Messages' && unreadDmCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
                    {unreadDmCount > 99 ? '99+' : unreadDmCount}
                  </span>
                )}
              </Button>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}