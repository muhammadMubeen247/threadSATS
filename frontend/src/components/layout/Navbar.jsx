import { Link, useNavigate } from 'react-router-dom';
import { Search, Bell, User, LogOut } from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  // --- Search state ---
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]); // backend returns { users: [...] }
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const abortRef = useRef(null);
  const blurTimerRef = useRef(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || 'U';
  };

  useEffect(() => {
    // close + reset when empty
    if (!trimmedQuery) {
      setResults([]);
      setSearchError('');
      setIsSearching(false);
      setIsDropdownOpen(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }

    // debounce + cancel previous request
    setIsSearching(true);
    setSearchError('');
    setIsDropdownOpen(true);

    const t = window.setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await api.get('/users/search', {
          params: { q: trimmedQuery, page: 1, limit: 10 },
          signal: controller.signal,
        });

        setResults(Array.isArray(res.users) ? res.users : []);
      } catch (err) {
        // ignore abort errors
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;

        setResults([]);
        setSearchError(err?.response?.data?.message || err?.message || 'Search failed');
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [trimmedQuery]);

  const onSearchFocus = () => {
    if (blurTimerRef.current) window.clearTimeout(blurTimerRef.current);
    if (trimmedQuery) setIsDropdownOpen(true);
  };

  const onSearchBlur = () => {
    // small delay so clicking a dropdown item still works
    blurTimerRef.current = window.setTimeout(() => setIsDropdownOpen(false), 150);
  };

  const goToUser = (username) => {
    setIsDropdownOpen(false);
    setQuery('');
    setResults([]);
    navigate(`/@${username}`);
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/home" className="flex items-center space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            B
          </div>
          <span className="hidden font-bold sm:inline-block">Bark</span>
        </Link>

        {/* Search Bar */}
        <div className="flex-1 max-w-md mx-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search Bark..."
              className="pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={onSearchFocus}
              onBlur={onSearchBlur}
            />

            {/* Dropdown */}
            {isDropdownOpen && trimmedQuery && (
              <div className="absolute left-0 right-0 mt-2 rounded-lg border bg-background shadow-lg overflow-hidden z-50">
                {isSearching ? (
                  <div className="p-3 text-sm text-muted-foreground">Searching…</div>
                ) : searchError ? (
                  <div className="p-3 text-sm text-red-500">{searchError}</div>
                ) : results.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No users found</div>
                ) : (
                  <ul className="max-h-80 overflow-auto">
                    {results.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-3"
                          onMouseDown={(e) => e.preventDefault()} // prevents blur before click
                          onClick={() => goToUser(u.username)}
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={u.profilePic} alt={u.username} />
                            <AvatarFallback>{getInitials(u.username)}</AvatarFallback>
                          </Avatar>

                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">@{u.username}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {u.rollNumber} • {u.department} • {u.batch}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center space-x-4">
          <ThemeToggle />

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.profilePic} alt={user?.username} />
                  <AvatarFallback>{getInitials(user?.username)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">@{user?.username}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => user?.username && navigate(`/@${user.username}`)}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>Settings</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}