import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MoreHorizontal, Search, Smile, Check, CheckCheck, X, Inbox } from 'lucide-react';

import api from '@/api/axios';
import { useAuthStore } from '@/store/authStore';
import { connectSocket } from '@/socket/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Navbar from '@/components/layout/Navbar';

// ✅ emoji picker web component (React 19 friendly)
import 'emoji-picker-element';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function containsId(arr, id) {
  const s = String(id);
  return Array.isArray(arr) && arr.some((x) => String(x) === s);
}

function ConversationRow({ convo, active, onOpen }) {
  const other = convo?.other;
  const last = convo?.lastMessage;

  return (
    <button
      onClick={() => onOpen(convo.id)}
      className={[
        'w-full text-left rounded-xl px-3 py-2 transition-colors',
        active ? 'bg-muted/40' : 'hover:bg-muted/25',
      ].join(' ')}
      type="button"
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarImage src={other?.profilePic || ''} alt={other?.handle || 'User'} />
          <AvatarFallback>{(other?.handle || '?')[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold truncate">@{other?.handle}</div>
            <div className="text-xs text-muted-foreground shrink-0">
              {formatTime(last?.createdAt)}
            </div>
          </div>

          <div className="text-sm text-muted-foreground truncate">
            {last?.text || 'No messages yet'}
          </div>
        </div>
      </div>
    </button>
  );
}

function ConversationList({ conversations, activeId, onOpen, onBack }) {
  const [q, setQ] = useState('');

  // ✅ remote contact search
  const [remote, setRemote] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const remoteAbortRef = useRef(null);

  const trimmed = useMemo(() => q.trim(), [q]);

  useEffect(() => {
    if (!trimmed) {
      setRemote([]);
      setRemoteError('');
      setRemoteLoading(false);
      if (remoteAbortRef.current) remoteAbortRef.current.abort();
      return;
    }

    setRemoteLoading(true);
    setRemoteError('');

    const t = window.setTimeout(async () => {
      try {
        if (remoteAbortRef.current) remoteAbortRef.current.abort();
        const controller = new AbortController();
        remoteAbortRef.current = controller;

        const res = await api.get('/dm/search/contacts', {
          params: { q: trimmed, limit: 30 },
          signal: controller.signal,
        });

        const results = Array.isArray(res.results) ? res.results : [];
        // normalize into ConversationRow shape
        setRemote(
          results.map((r) => ({
            id: r.conversationId,
            updatedAt: r.updatedAt,
            other: r.persona,
            lastMessage: null,
          }))
        );
      } catch (e) {
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
        setRemote([]);
        setRemoteError(e?.message || 'Search failed');
      } finally {
        setRemoteLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [trimmed]);

  const list = trimmed ? remote : conversations;

  return (
    <div className="h-[calc(100vh-64px)] border-r border-border bg-card/40">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted/30"
            title="Back"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>

          <div className="text-xl font-semibold">Messages</div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts..."
            className="w-full bg-transparent outline-none text-sm"
          />
        </div>

        {trimmed ? (
          <div className="mt-2 text-xs text-muted-foreground">
            {remoteLoading ? 'Searching…' : remoteError ? remoteError : `${list.length} result(s)`}
          </div>
        ) : null}
      </div>

      <div className="px-2 pb-3 overflow-y-auto h-[calc(100vh-184px)]">
        <div className="space-y-1">
          {list.map((c) => (
            <ConversationRow key={c.id} convo={c} active={c.id === activeId} onOpen={onOpen} />
          ))}
        </div>

        {!list.length ? (
          <div className="p-4 text-sm text-muted-foreground">
            {trimmed ? 'No contacts found.' : 'No conversations found.'}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({ mine, text, time, status }) {
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div className="max-w-[72%]">
        <div
          className={[
            'rounded-2xl px-4 py-2 text-sm leading-relaxed',
            mine ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted/40 rounded-bl-md',
          ].join(' ')}
        >
          {text}
        </div>

        <div className={mine ? 'text-right' : 'text-left'}>
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            {formatTime(time)}

            {mine ? (
              status === 'seen' ? (
                // ✅ blue double tick when seen
                <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
              ) : status === 'delivered' ? (
                // ✅ gray double tick when delivered
                <CheckCheck className="h-3.5 w-3.5 opacity-80" />
              ) : (
                // ✅ single gray tick when only sent
                <Check className="h-3.5 w-3.5 opacity-70" />
              )
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatWindow({ conversationId, myPersonaId, conversationMeta, onSentOrReceived }) {
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = connectSocket();
  }, []);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  // ✅ pagination cursor for loading older messages
  const [nextBefore, setNextBefore] = useState(null);

  // ✅ message search UI
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const searchAbortRef = useRef(null);

  // ✅ emoji menu state
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiWrapRef = useRef(null);
  const pickerRef = useRef(null);
  const inputRef = useRef(null);

  const bottomRef = useRef(null);



  // ✅ insert emoji at cursor
  const insertEmoji = useCallback((emoji) => {
    const el = inputRef.current;
    if (!el) {
      setText((prev) => `${prev}${emoji}`);
      return;
    }

    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;

    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);

    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }, [text]);

  // ✅ close emoji menu on outside click / ESC
  useEffect(() => {
    if (!emojiOpen) return;

    const onDown = (e) => {
      if (!emojiWrapRef.current) return;
      if (!emojiWrapRef.current.contains(e.target)) setEmojiOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setEmojiOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [emojiOpen]);

  // ✅ listen for emoji clicks from the web component
  useEffect(() => {
    if (!emojiOpen) return;
    const picker = pickerRef.current;
    if (!picker) return;

    const onEmojiClick = (e) => {
      const unicode = e?.detail?.unicode;
      if (unicode) insertEmoji(unicode);
      setEmojiOpen(false);
    };

    picker.addEventListener('emoji-click', onEmojiClick);
    return () => picker.removeEventListener('emoji-click', onEmojiClick);
  }, [emojiOpen, insertEmoji]);

  // ✅ load messages
  useEffect(() => {
    if (!conversationId) return;

    const controller = new AbortController();

    setLoading(true);
    setMessages([]);
    setNextBefore(null);

    (async () => {
      try {
        const res = await api.get(`/dm/conversations/${conversationId}/messages`, {
          params: { limit: 50 },
          signal: controller.signal,
        });
        setMessages(res.messages || []);
        setNextBefore(res.nextBefore || null);
      } catch (e) {
        if (e?.name !== 'CanceledError' && e?.code !== 'ERR_CANCELED') {
          setMessages([]);
          setNextBefore(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [conversationId]);

  // ✅ load older page
  const loadOlder = useCallback(async () => {
    if (!conversationId) return null;
    if (!nextBefore) return null;

    const res = await api.get(`/dm/conversations/${conversationId}/messages`, {
      params: { limit: 50, before: nextBefore },
    });

    const older = Array.isArray(res.messages) ? res.messages : [];
    setMessages((prev) => {
      // prepend, de-dupe
      const seen = new Set(prev.map((m) => String(m._id || m.id)));
      const merged = [...older.filter((m) => !seen.has(String(m._id || m.id))), ...prev];
      return merged;
    });
    setNextBefore(res.nextBefore || null);
    return older;
  }, [conversationId, nextBefore]);

  // ✅ conversation message search (server-side)
  useEffect(() => {
    const q = searchQ.trim();
    if (!searchOpen) return;

    if (!q) {
      setSearchResults([]);
      setSearchError('');
      setSearching(false);
      if (searchAbortRef.current) searchAbortRef.current.abort();
      return;
    }

    setSearching(true);
    setSearchError('');

    const t = window.setTimeout(async () => {
      try {
        if (searchAbortRef.current) searchAbortRef.current.abort();
        const controller = new AbortController();
        searchAbortRef.current = controller;

        const res = await api.get('/dm/search/messages', {
          params: { q, conversationId, limit: 30 },
          signal: controller.signal,
        });

        setSearchResults(Array.isArray(res.results) ? res.results : []);
      } catch (e) {
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
        setSearchResults([]);
        setSearchError(e?.message || 'Search failed');
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [searchOpen, searchQ, conversationId]);

  const scrollToMessage = useCallback((messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // ✅ ensure a message is loaded; keep fetching older pages until found (bounded)
  const jumpToMessage = useCallback(
    async (messageId) => {
      if (!messageId) return;

      const hasIt = (arr) => arr.some((m) => String(m._id || m.id) === String(messageId));
      if (hasIt(messages)) {
        scrollToMessage(messageId);
        return;
      }

      let tries = 0;
      while (!hasIt(messages) && nextBefore && tries < 10) {
        tries += 1;
        const older = await loadOlder();
        if (!older || older.length === 0) break;
      }

      // after state updates, wait a tick then scroll
      requestAnimationFrame(() => scrollToMessage(messageId));
    },
    [messages, nextBefore, loadOlder, scrollToMessage]
  );

  // ✅ helper: acknowledge delivered for an incoming message
  const ackDelivered = useCallback(
    (messageId) => {
      if (!conversationId || !messageId) return;
      // const s = connectSocket();
      // s.emit('dm:delivered', { conversationId, messageId });
      socketRef.current?.emit('dm:delivered', { conversationId, messageId });
    },
    [conversationId]
  );

  // ✅ helper: mark seen up to a message id (only when tab is visible)
  const ackSeenUpTo = useCallback(
    (upToMessageId) => {
      if (!conversationId || !upToMessageId) return;
      if (document.visibilityState !== 'visible') return;

      // const s = connectSocket();
      // s.emit('dm:seen', { conversationId, upToMessageId });
      socketRef.current?.emit('dm:seen', { conversationId, upToMessageId });
    },
    [conversationId]
  );

  // ✅ listen to server status updates and apply to local message objects
  useEffect(() => {
    if (!conversationId || !socketRef.current) return;

    // const s = connectSocket();
    const s = socketRef.current;

    const onStatus = (payload) => {
      if (payload?.conversationId !== conversationId) return;
      const mid = String(payload?.messageId || '');
      if (!mid) return;

      setMessages((prev) =>
        prev.map((m) => {
          const id = String(m._id || m.id);
          if (id !== mid) return m;
          return {
            ...m,
            deliveredTo: payload.deliveredTo ?? m.deliveredTo ?? [],
            seenBy: payload.seenBy ?? m.seenBy ?? [],
          };
        })
      );
    };

    const onSeenUpto = (payload) => {
      if (payload?.conversationId !== conversationId) return;
      const pid = String(payload?.personaId || '');
      const upTo = String(payload?.upToMessageId || '');
      if (!pid || !upTo) return;

      // best-effort: ObjectId comparison works for same-type strings in most cases
      setMessages((prev) =>
        prev.map((m) => {
          const id = String(m._id || m.id);
          if (id > upTo) return m;

          const delivered = Array.isArray(m.deliveredTo) ? m.deliveredTo : [];
          const seen = Array.isArray(m.seenBy) ? m.seenBy : [];

          return {
            ...m,
            deliveredTo: containsId(delivered, pid) ? delivered : [...delivered, pid],
            seenBy: containsId(seen, pid) ? seen : [...seen, pid],
          };
        })
      );
    };

    s.on('dm:message_status', onStatus);
    s.on('dm:seen_upto', onSeenUpto);

    return () => {
      s.off('dm:message_status', onStatus);
      s.off('dm:seen_upto', onSeenUpto);
    };
  }, [conversationId]);

  // ✅ when messages load/change in an open chat:
  // - deliver all incoming messages
  // - mark seen up to the latest message
  useEffect(() => {
    if (!conversationId) return;
    if (loading) return;
    if (!messages.length) return;

    // deliver any incoming messages not yet delivered by me
    for (const m of messages) {
      const isIncoming = String(m.senderPersonaId) !== String(myPersonaId);
      if (!isIncoming) continue;

      const mid = m._id || m.id;
      if (!mid) continue;

      if (!containsId(m.deliveredTo, myPersonaId)) {
        ackDelivered(mid);
      }
    }

    const last = messages[messages.length - 1];
    const lastId = last?._id || last?.id;
    if (lastId) ackSeenUpTo(lastId);
  }, [conversationId, loading, messages, myPersonaId, ackDelivered, ackSeenUpTo]);

  // ✅ if user returns to the tab, mark seen again
  useEffect(() => {
    if (!conversationId) return;

    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const last = messages[messages.length - 1];
      const lastId = last?._id || last?.id;
      if (lastId) ackSeenUpTo(lastId);
    };

    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [conversationId, messages, ackSeenUpTo]);

  // join room + realtime updates (UPDATED: re-join after reconnect)
  useEffect(() => {
    if (!conversationId || !socketRef.current) return;

    const s = socketRef.current;

    const join = () => s.emit('dm:join', { conversationId });

    join();                 // join now
    s.on('connect', join);  // ✅ re-join on reconnect

    const onNew = (payload) => {
      if (payload?.conversationId !== conversationId) return;
      const msg = payload?.message;
      if (!msg) return;

      setMessages((prev) => {
        const msgId = String(msg._id || msg.id);
        if (prev.some((m) => String(m._id || m.id) === msgId)) return prev;
        return [...prev, msg];
      });

      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });

      // ✅ receiver acks
      if (String(msg.senderPersonaId) !== String(myPersonaId)) {
        const mid = msg._id || msg.id;
        if (mid) {
          ackDelivered(mid);
          ackSeenUpTo(mid);
        }
      }
    };

    s.on('dm:new_message', onNew);

    return () => {
      s.off('dm:new_message', onNew);
      s.off('connect', join);
      s.emit('dm:leave', { conversationId });
    };
  }, [conversationId, myPersonaId, ackDelivered, ackSeenUpTo]);

  // ✅ ADD/UPDATE: send message handler (used by Enter + Send button)
  const send = useCallback(async () => {
    const body = text.trim();
    if (!conversationId) return;
    if (!body) return;
    if (sending) return;

    setSending(true);
    try {
      const res = await api.post(`/dm/conversations/${conversationId}/messages`, { text: body });
      const msg = res?.message;

      if (msg) {
        const msgId = String(msg._id || msg.id);

        // ✅ show instantly (and avoid duplicates if socket also delivers it later)
        setMessages((prev) => {
          if (prev.some((m) => String(m._id || m.id) === msgId)) return prev;
          return [...prev, msg];
        });

        onSentOrReceived?.(conversationId, msg);

        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
      }

      setText('');
      setEmojiOpen(false);
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  }, [text, conversationId, sending, onSentOrReceived]);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-10 w-10">
              <AvatarImage
                src={conversationMeta?.other?.profilePic || ''}
                alt={conversationMeta?.other?.handle ? `@${conversationMeta.other.handle}` : 'User'}
              />
              <AvatarFallback>{(conversationMeta?.other?.handle || '?')[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <div className="font-semibold truncate">@{conversationMeta?.other?.handle || 'Chat'}</div>
              <div className="text-xs text-muted-foreground truncate">
                {conversationMeta?.other?.displayName || ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted/30"
              type="button"
              title="Search in chat"
              onClick={() => setSearchOpen((v) => !v)}
            >
              <Search className="h-4 w-4 text-muted-foreground" />
            </button>

            <button
              className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted/30"
              type="button"
              title="More"
            >
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* ✅ Search panel */}
        {searchOpen ? (
          <div className="mt-3 rounded-xl border border-border bg-card/40 p-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search in this chat..."
                className="w-full bg-transparent outline-none text-sm"
              />
              <button
                type="button"
                className="h-7 w-7 inline-flex items-center justify-center rounded-full hover:bg-muted/30"
                title="Close"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQ('');
                  setSearchResults([]);
                  setSearchError('');
                }}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="mt-2 text-xs text-muted-foreground">
              {searching ? 'Searching…' : searchError ? searchError : `${searchResults.length} result(s)`}
            </div>

            {searchResults.length ? (
              <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
                {searchResults.map((r) => (
                  <button
                    key={String(r.id)}
                    type="button"
                    onClick={() => jumpToMessage(r.id)}
                    className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted/25"
                  >
                    <div className="text-sm truncate">{r.text}</div>
                    <div className="text-xs text-muted-foreground">{formatTime(r.createdAt)}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {!loading && nextBefore ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={loadOlder}
              className="text-xs text-muted-foreground hover:underline"
            >
              Load older messages
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">Loading chat…</div>
        ) : (
          <>
            {messages.map((m) => {
              const id = String(m._id || m.id);
              const mine = String(m.senderPersonaId) === String(myPersonaId);

              let status = 'sent';
              const otherPersonaId = conversationMeta?.other?.id;
              if (mine && otherPersonaId) {
                if (containsId(m.seenBy, otherPersonaId)) status = 'seen';
                else if (containsId(m.deliveredTo, otherPersonaId)) status = 'delivered';
              }

              return (
                <div key={id} id={`msg-${id}`}>
                  <MessageBubble mine={mine} text={m.text} time={m.createdAt} status={status} />
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        <div ref={emojiWrapRef} className="relative">
          {emojiOpen ? (
            <div className="absolute bottom-14 left-0 z-50">
              <div className="rounded-xl border border-border bg-background shadow-lg overflow-hidden">
                {/* emoji-picker-element web component */}
                <emoji-picker ref={pickerRef}></emoji-picker>
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/40 px-3 py-2">
            <button
              className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted/30"
              type="button"
              title="Emoji"
              onClick={() => setEmojiOpen((v) => !v)}
            >
              <Smile className="h-5 w-5 text-muted-foreground" />
            </button>

            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a message..."
              className="flex-1 bg-transparent outline-none text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />

            <button
              onClick={send}
              disabled={sending || !text.trim()}
              className="rounded-xl px-4 py-2 bg-primary text-primary-foreground disabled:opacity-50 text-sm font-medium"
              type="button"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyChatPane() {
  return (
    <div className="h-[calc(100vh-64px)] flex items-center justify-center bg-background">
      <div className="text-center max-w-md px-6">
        {/* 📬 Mailbox art */}
        <div className="flex justify-center mb-4">
          <div className="h-20 w-20 rounded-2xl bg-muted/30 flex items-center justify-center">
            <Inbox className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>

        <div className="text-2xl font-semibold">Welcome to Chat</div>
        <div className="mt-2 text-sm text-muted-foreground">
          Talk about stuff with your contacts.
        </div>
      </div>
    </div>
  );
}


export default function Messages() {
  const navigate = useNavigate();
  const { conversationId } = useParams();

  const { personas, activeMode } = useAuthStore();
  const myPersonaId = useMemo(() => personas?.[activeMode]?.id, [personas, activeMode]);

  const [conversations, setConversations] = useState([]);

  // ✅ fetch conversations ONLY when mode changes (no flicker on chat switch)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // clear only on mode change (expected)
      setConversations([]);

      try {
        const res = await api.get('/dm/conversations');
        if (cancelled) return;
        setConversations(res.conversations || []);
      } catch {
        if (!cancelled) setConversations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeMode]);

  // ✅ if current URL conversationId doesn't exist in this mode, go back to inbox root
  useEffect(() => {
    if (!conversationId) return;
    if (!conversations.length) return; // wait until loaded

    if (!conversations.some((c) => c.id === conversationId)) {
      navigate('/messages', { replace: true });
    }
  }, [conversationId, conversations, navigate]);

  // ✅ do NOT stack chat routes in history; replace instead
  const openConversation = (id) => navigate(`/messages/${id}`, { replace: true });

  // ✅ back: now this will go to the page before Messages (home/profile/etc)
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/home');
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === conversationId) || null,
    [conversations, conversationId]
  );

  // update sidebar preview on send/receive
  const bumpConversation = useCallback((id, msg) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;

      const updated = {
        ...prev[idx],
        lastMessage: {
          id: msg._id || msg.id,
          text: msg.text,
          createdAt: msg.createdAt,
          senderPersonaId: msg.senderPersonaId,
        },
      };

      return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  // ✅ global dm:new_message listener (updates sidebar without refresh)
  useEffect(() => {
    const s = connectSocket();

    const onAnyNew = (payload) => {
      const id = payload?.conversationId;
      const msg = payload?.message;
      if (!id || !msg) return;

      bumpConversation(id, msg);
    };

    s.on('dm:new_message', onAnyNew);
    return () => s.off('dm:new_message', onAnyNew);
  }, [bumpConversation, activeMode]);

  return (
    <>
      <Navbar />

      <div className="grid grid-cols-[360px_1fr]">
        <ConversationList
          conversations={conversations}
          activeId={conversationId}
          onOpen={openConversation}
          onBack={goBack}
        />

        {/* ✅ Show empty state until a conversation is opened */}
        {!conversationId ? (
          <EmptyChatPane />
        ) : (
          <ChatWindow
            key={conversationId}
            conversationId={conversationId}
            myPersonaId={myPersonaId}
            conversationMeta={activeConversation}
            onSentOrReceived={bumpConversation}
          />
        )}
      </div>
    </>
  );
}