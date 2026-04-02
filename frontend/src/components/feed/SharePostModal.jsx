import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import api from '@/api/axios';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Modal for sharing a thread to one or more DM conversations.
 * Props: open, onClose, threadId
 */
export default function SharePostModal({ open, onClose, threadId, onShared }) {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const debounceRef = useRef(null);

  // Reset on open/close
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(new Set());
    setError('');
    setDone(false);
    setSending(false);
    fetchContacts('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchContacts = useCallback(async (q) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/dm/share/contacts', { params: { q, limit: 30 } });
      setContacts(res?.contacts || []);
    } catch {
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchContacts(q), 300);
  };

  const toggleSelect = (personaId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(personaId)) next.delete(personaId);
      else next.add(personaId);
      return next;
    });
  };

  const handleSend = async () => {
    if (!selected.size || !threadId) return;
    setSending(true);
    setError('');

    const contactMap = new Map(contacts.map((c) => [String(c.persona.id), c]));

    const results = await Promise.allSettled(
      [...selected].map(async (personaId) => {
        const contact = contactMap.get(personaId);
        if (!contact) return;

        // Create or get conversation
        let convoId = contact.conversationId ? String(contact.conversationId) : null;
        if (!convoId) {
          const res = await api.post('/dm/conversations', { targetHandle: contact.persona.handle });
          convoId = res?.conversation?.id;
        }
        if (!convoId) throw new Error('Could not resolve conversation');

        // Send the shared thread message
        await api.post(`/dm/conversations/${convoId}/messages`, { sharedThreadId: threadId });
      })
    );

    setSending(false);

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length) {
      setError(`Failed to send to ${failures.length} recipient${failures.length > 1 ? 's' : ''}`);
    }

    const successes = results.filter((r) => r.status === 'fulfilled');
    if (successes.length) {
      onShared?.();
      setDone(true);
      setTimeout(() => onClose?.(), 1200);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-md w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Share post</DialogTitle>
        </DialogHeader>

        {/* Search bar */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              placeholder="Search people…"
              className="w-full rounded-lg border bg-muted/30 py-2 pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Contact list */}
        <div className="max-h-72 overflow-y-auto divide-y divide-border">
          {loading && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {!loading && contacts.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {query ? 'No results' : 'Follow someone to share with them'}
            </p>
          )}
          {!loading &&
            contacts.map((c) => {
              const pid = String(c.persona.id);
              const isSelected = selected.has(pid);
              return (
                <button
                  key={pid}
                  onClick={() => toggleSelect(pid)}
                  className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={c.persona.profilePic} />
                    <AvatarFallback>
                      {(c.persona.displayName || c.persona.handle || '?')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {c.persona.displayName || c.persona.handle}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">@{c.persona.handle}</p>
                  </div>
                  {/* Checkbox */}
                  <div
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-sky-500 border-sky-500'
                        : 'border-muted-foreground/40 bg-transparent'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex flex-col gap-2">
          {error && <p className="text-xs text-red-500">{error}</p>}
          {done ? (
            <p className="text-sm text-center text-green-500 font-medium">Sent!</p>
          ) : (
            <Button
              onClick={handleSend}
              disabled={!selected.size || sending}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white"
            >
              {sending
                ? 'Sending…'
                : selected.size
                ? `Send to ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`
                : 'Select someone'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
