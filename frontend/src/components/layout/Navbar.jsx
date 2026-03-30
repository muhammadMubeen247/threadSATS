import { Link, useNavigate } from 'react-router-dom';
import { Search, Bell, User, LogOut, Settings, Moon, Sun } from 'lucide-react';
import useScrollDirection from '@/hooks/useScrollDirection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/axios';
import { useEffect, useMemo, useState } from 'react';
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

import { connectSocket, disconnectSocket, getSocket } from '@/socket/client';
import { useNotificationsStore } from '@/store/notificationsStore';

// ✅ add
import personasIcon from '@/assets/personas_icon.png';

export default function Navbar() {
  const navigate = useNavigate();
  const scrollDir = useScrollDirection();

  const { user, logout, personas, activeMode, setPersonas, setActiveMode } = useAuthStore();
  const { unread, setUnread, upsertFromSocket } = useNotificationsStore();

  // ✅ single socket lifecycle effect:
  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }

    connectSocket();

    return () => {
      disconnectSocket();
    };
  }, [user, activeMode]);

  // ✅ anon setup dialog state
  const [anonSetupOpen, setAnonSetupOpen] = useState(false);
  const [anonHandle, setAnonHandle] = useState('');
  const [anonDisplayName, setAnonDisplayName] = useState('');
  const [anonBio, setAnonBio] = useState('');
  const [anonSetupError, setAnonSetupError] = useState('');
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);

  const getInitials = (username) => username?.substring(0, 2).toUpperCase() || 'U';

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

    // prefer persona for avatar/handle; fallback to user only in public mode
    return {
      username: activePersona?.handle || user?.username || '',
      profilePic: activePersona?.profilePic || (activeMode !== 'anon' ? user?.profilePic : '') || '',
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
      const data = e?.response?.data;

      // Backend returns 409 with setupRequired when anon persona needs initial setup
      if (nextMode === 'anon' && data?.setupRequired) {
        setAnonSetupError('');
        setAnonSetupOpen(true);
      } else if (nextMode === 'anon') {
        setAnonSetupError(e?.userMessage || e?.message || 'Failed to switch mode');
        setAnonSetupOpen(true);
      } else {
        console.error(e?.userMessage || e?.message || 'Failed to switch mode');
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

  // ✅ load unread once logged in (and when persona mode changes)
  useEffect(() => {
    const run = async () => {
      if (!user) return;
      try {
        const res = await api.get('/notifications/unread-count');
        if (typeof res?.unread === 'number') setUnread(res.unread);
      } catch {
        // ignore
      }
    };
    run();
  }, [user, activeMode, setUnread]);

  // ✅ realtime listeners
  useEffect(() => {
    if (!user) return;

    const socket = getSocket() || connectSocket();

    const onUnread = (payload) => {
      if (typeof payload?.unread === 'number') setUnread(payload.unread);
    };

    const onNew = (payload) => {
      const n = payload?.notification;
      if (n?._id) upsertFromSocket(n);
    };

    socket.on('notif:unread', onUnread);
    socket.on('notif:new', onNew);

    return () => {
      socket.off('notif:unread', onUnread);
      socket.off('notif:new', onNew);
    };
  }, [user, setUnread, upsertFromSocket]);

  // ✅ Theme state (shared between desktop button and mobile menu item)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
  };

  const ThemeToggleButton = ({ className = '' }) => (
    <Button variant="ghost" size="icon" onClick={toggleTheme} className={className}>
      {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </Button>
  );

  return (
    <nav className={`sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-transform duration-300 ${scrollDir === 'down' ? '-translate-y-full' : 'translate-y-0'} lg:translate-y-0`}>
      <div className="w-full relative flex h-16 items-center justify-between px-4">
        {/* Spacer on mobile to balance justify-between (logo is absolute) */}
        <div className="w-9 lg:hidden" />
        {/* Logo: centered on mobile, left-aligned on desktop */}
        <div className="absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0 flex items-center gap-2">
          <Link to="/home" className="flex items-center space-x-2">
            <img
              src={personasIcon}
              alt="Personas"
              className="h-16 w-16 rounded-lg object-contain"
            />
            <span className="hidden font-bold text-lg lg:inline-block">Personas</span>
          </Link>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Theme toggle – desktop only */}
          <ThemeToggleButton className="hidden lg:inline-flex" />

          {/* Search button – desktop only */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/search')}
            aria-label="Search"
            title="Search"
            className="hidden lg:inline-flex"
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* ✅ Public/Anon Toggle – desktop only */}
          {user && (
            <div className="hidden lg:flex items-center gap-2">
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

          {/* Bell – desktop only */}
          <Button
            variant="ghost"
            size="icon"
            className="relative hidden lg:inline-flex"
            onClick={() => navigate('/notifications')}
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />

            {unread > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] leading-5 text-center">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={displayIdentity.profilePic} alt={displayIdentity.username} />
                  <AvatarFallback>{getInitials(displayIdentity.username)}</AvatarFallback>
                </Avatar>
                {/* Red dot on mobile when unread notifications */}
                {unread > 0 ? (
                  <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-background lg:hidden" />
                ) : null}
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
              {/* Persona switch – mobile only */}
              {user ? (
                <div className="lg:hidden flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm">Public</span>
                  <Switch
                    checked={activeMode === 'anon'}
                    onCheckedChange={onToggleMode}
                    disabled={isSwitchingMode}
                    className="mx-2"
                  />
                  <span className="text-sm">Anon</span>
                </div>
              ) : null}
              <DropdownMenuItem onClick={() => navigate('/me')}>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              {/* Notifications – mobile only */}
              <DropdownMenuItem onClick={() => navigate('/notifications')} className="lg:hidden">
                <Bell className="mr-2 h-4 w-4" />
                Notifications
                {unread > 0 ? (
                  <span className="ml-auto min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] leading-5 text-center">
                    {unread > 99 ? '99+' : unread}
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              {/* Theme toggle – mobile only */}
              <DropdownMenuItem onClick={toggleTheme} className="lg:hidden">
                {theme === 'light' ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                {theme === 'light' ? 'Dark mode' : 'Light mode'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ✅ Anon Setup Dialog stays as-is */}
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