import { Link, useLocation } from 'react-router-dom';
import { Home, User, Search, Settings, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore'

export default function Sidebar({ onCreateThread }) {
  const location = useLocation();
  const { user } = useAuthStore();
  
  const profilePath = user ? '/@'+user.username : '/login';

  const navItems = [
    { name: 'Home', icon: Home, path: '/home' },
    { name: 'Profile', icon: User, path: profilePath },
    { name: 'Search', icon: Search, path: '/search' },
    { name: 'Settings', icon: Settings, path: '/settings' },
  ];

  return (
    <aside className="sticky top-16 h-[calc(100vh-4rem)] w-64 border-r bg-background p-4">
      <nav className="space-y-2">
        {/* Create Thread Button */}
        {onCreateThread && (
          <Button
            onClick={onCreateThread}
            className="w-full justify-start"
            size="lg"
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            Create Thread
          </Button>
        )}

        {/* Navigation Items */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link key={item.path} to={item.path}>
              <Button
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'w-full justify-start',
                  isActive && 'bg-secondary'
                )}
                size="lg"
              >
                <Icon className="mr-2 h-5 w-5" />
                {item.name}
              </Button>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}