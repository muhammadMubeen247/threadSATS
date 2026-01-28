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

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

// ✅ add
import { connectSocket, disconnectSocket } from '@/socket/client';

export default function Navbar() {
  const navigate = useNavigate();

  const { user, logout, personas, activeMode, setPersonas, setActiveMode } = useAuthStore();

  // ✅ keep socket connected while logged in
  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }

    connectSocket();

    return () => {
      disconnectSocket();
    };
  }, [user]);

  // ✅ reconnect on mode switch so backend presence reflects active persona
  useEffect(() => {
    if (!user) return;
    disconnectSocket();
    connectSocket();
  }, [activeMode, user]);

  // --- Search state ---
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const abortRef = useRef(null);
  const blurTimerRef = useRef(null);

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  // ✅ anon setup dialog state
  const [anonSetupOpen, setAnonSetupOpen] = useState(false);
  const [anonHandle, setAnonHandle] = useState('');
  const [anonDisplayName, setAnonDisplayName] = useState('');
  const [anonBio, setAnonBio] = useState('');
  const [anonSetupError, setAnonSetupError] = useState('');
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);

  const getInitials = (username) => {
    return username?.substring(0, 2).toUpperCase() || 'U';
  };

  // ✅ load personas once authenticated (navbar mount / refresh)
  useEffect(() => {
    const load = async () => {
      if (!user) return;

      try {
        const res = await api.get('/users/me/personas');
        if (res?.personas) setPersonas(res.personas);
        if (res?.activeMode) setActiveMode(res.activeMode);

        // prefill anon setup fields (nice UX)
        const anon = res?.personas?.anon;
        if (anon) {
          setAnonHandle(anon.handle || '');
          setAnonDisplayName(anon.displayName || '');
          setAnonBio(anon.bio || '');
        }
      } catch (e) {
        // ignore (user may be logged out / cookie expired)
        console.error('Failed to load personas:', e);
      }
    };

    load();
  }, [user, setPersonas, setActiveMode]);

  const displayIdentity = useMemo(() => {
    const activePersona = activeMode === 'anon' ? personas?.anon : personas?.public;

    // prefer persona for avatar/handle; fallback to user
    return {
      username: activePersona?.handle || user?.username || '',
      profilePic: activePersona?.profilePic || user?.profilePic || '',
      email: user?.email || '',
    };
  }, [activeMode, personas, user]);

  const handleLogout = async () => {
    try {
      // ✅ ensure socket is closed on logout
      disconnectSocket();

      await api.post('/auth/logout');
      logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
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

        // ✅ persona search endpoint
        const res = await api.get('/personas/search', {
          params: { q: trimmedQuery, page: 1, limit: 10 },
          signal: controller.signal,
        });

        setResults(Array.isArray(res.results) ? res.results : []);
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

  const goToPersona = (handle) => {
    const h = (handle || '').trim().replace(/^@+/, '');
    if (!h) return;

    setIsDropdownOpen(false);
    setQuery('');
    setResults([]);
    navigate(`/@${h}`);
  };

  // ✅ mode switcher
  const switchMode = async (nextMode) => {
    if (!user) return;

    setIsSwitchingMode(true);
    try {
      const res = await api.put('/users/me/mode', { mode: nextMode });
      if (res?.success) {
        setActiveMode(res.activeMode);
        // refresh personas so navbar reflects latest pics/handles
        const refreshed = await api.get('/users/me/personas');
        if (refreshed?.personas) setPersonas(refreshed.personas);
        return;
      }

      // if backend returns setupRequired, open dialog
      if (res?.setupRequired) {
        setAnonSetupError('');
        setAnonSetupOpen(true);
      }
    } catch (e) {
      // our axios interceptor throws Error(message)
      const msg = e?.message || 'Failed to switch mode';

      // if your backend returns 409 with setupRequired, interceptor will only provide message.
      // we still open setup dialog when toggling to anon.
      if (nextMode === 'anon') {
        setAnonSetupError(msg);
        setAnonSetupOpen(true);
      } else {
        console.error(msg);
      }
    } finally {
      setIsSwitchingMode(false);
    }
  };

  const onToggleMode = async (checked) => {
    if (isSwitchingMode) return;
    const nextMode = checked ? 'anon' : 'public';
    await switchMode(nextMode);
  };

  const submitAnonSetup = async () => {
    setAnonSetupError('');
    try {
      if (!anonHandle.trim() || !anonDisplayName.trim()) {
        setAnonSetupError('Handle and display name are required');
        return;
      }

      await api.put('/users/me/personas/anon/setup', {
        handle: anonHandle.trim().toLowerCase(),
        displayName: anonDisplayName.trim(),
        bio: anonBio,
      });

      setAnonSetupOpen(false);

      // after setup, switch to anon
      await switchMode('anon');
    } catch (e) {
      setAnonSetupError(e?.message || 'Failed to setup anonymous persona');
    }
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
              placeholder="Search profiles..."
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
                  <div className="p-3 text-sm text-muted-foreground">No profiles found</div>
                ) : (
                  <ul className="max-h-80 overflow-auto">
                    {results.map((p) => {
                      const handle = p?.handle || p?.username;
                      const displayName = p?.displayName || handle || 'Profile';
                      const typeLabel = p?.type === 'anon' ? 'Anon' : 'Public';

                      // ✅ show rollNumber only for public personas (backend already blanks it for anon)
                      const rollNumber = p?.type === 'public' && p?.rollNumber ? p.rollNumber : '';

                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-3"
                            onMouseDown={(e) => e.preventDefault()} // prevents blur before click
                            onClick={() => goToPersona(handle)}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={p.profilePic} alt={handle || 'profile'} />
                              <AvatarFallback>{getInitials(handle)}</AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">
                                @{handle}{' '}
                                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground align-middle">
                                  {typeLabel}
                                </span>
                              </div>

                              {/* ✅ second line now includes rollNumber for public personas */}
                              <div className="text-xs text-muted-foreground truncate">
                                {displayName}
                                {rollNumber ? ` • ${rollNumber}` : ''}
                                {typeof p.threadsCount === 'number' ? ` • ${p.threadsCount} posts` : ''}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center space-x-4">
          <ThemeToggle />

          {/* ✅ Public/Anon Toggle */}
          {user && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground" htmlFor="mode-toggle">
                Public
              </Label>
              <Switch
                id="mode-toggle"
                checked={activeMode === 'anon'}
                onCheckedChange={onToggleMode}
                disabled={isSwitchingMode}
              />
              <Label className="text-xs text-muted-foreground" htmlFor="mode-toggle">
                Anon
              </Label>
            </div>
          )}

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={displayIdentity.profilePic} alt={displayIdentity.username} />
                  <AvatarFallback>{getInitials(displayIdentity.username)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">@{displayIdentity.username}</p>
                  <p className="text-xs leading-none text-muted-foreground">{displayIdentity.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/me')}>
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

      {/* ✅ Anon Setup Dialog */}
      <Dialog open={anonSetupOpen} onOpenChange={setAnonSetupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up anonymous persona</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {anonSetupError ? <div className="text-sm text-red-600">{anonSetupError}</div> : null}

            <div className="space-y-1">
              <Label htmlFor="anon-handle">Handle</Label>
              <Input
                id="anon-handle"
                placeholder="e.g. mysterycat"
                value={anonHandle}
                onChange={(e) => setAnonHandle(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="anon-displayName">Display name</Label>
              <Input
                id="anon-displayName"
                placeholder="e.g. Mystery Cat"
                value={anonDisplayName}
                onChange={(e) => setAnonDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="anon-bio">Bio (optional)</Label>
              <Textarea
                id="anon-bio"
                placeholder="Say something…"
                value={anonBio}
                onChange={(e) => setAnonBio(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAnonSetupOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAnonSetup}>Save & switch to anon</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </nav>
  );
}