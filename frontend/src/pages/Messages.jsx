import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MoreHorizontal, Phone, Search, Smile } from 'lucide-react';

import api from '@/api/axios';
import { useAuthStore } from '@/store/authStore';
import { connectSocket, disconnectSocket } from '@/socket/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// ✅ add navbar on top
import Navbar from '@/components/layout/Navbar';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((c) => (c?.other?.handle || '').toLowerCase().includes(query));
  }, [conversations, q]);

  return (
    // ✅ subtract navbar height (h-16 = 64px)
    <div className="h-[calc(100vh-64px)] border-r border-border bg-card/40">
      <div className="p-4">
        {/* ✅ header row with back button */}
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
            placeholder="Search messages..."
            className="w-full bg-transparent outline-none text-sm"
          />
        </div>
      </div>

      {/* ✅ also subtract navbar height */}
      <div className="px-2 pb-3 overflow-y-auto h-[calc(100vh-184px)]">
        <div className="space-y-1">
          {filtered.map((c) => (
            <ConversationRow key={c.id} convo={c} active={c.id === activeId} onOpen={onOpen} />
          ))}
        </div>

        {!filtered.length ? (
          <div className="p-4 text-sm text-muted-foreground">No conversations found.</div>
        ) : null}
      </div>
    </div>
  );
}

function MessageBubble({ mine, text, time }) {
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
          <span className="mt-1 inline-block text-[11px] text-muted-foreground">
            {formatTime(time)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatWindow({ conversationId, myPersonaId, conversationMeta, onSentOrReceived }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const bottomRef = useRef(null);

  // load messages
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    (async () => {
      const res = await api.get(`/dm/conversations/${conversationId}/messages`, {
        params: { limit: 50 },
      });
      if (!cancelled) setMessages(res.messages || []);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // auto scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, conversationId]);

  // join room + realtime updates
  useEffect(() => {
    if (!conversationId) return;

    const s = connectSocket();
    s.emit('dm:join', { conversationId });

    const onNew = (payload) => {
      if (payload?.conversationId !== conversationId) return;
      const msg = payload?.message;
      if (!msg) return;

      setMessages((prev) => {
        const msgId = String(msg._id || msg.id);
        if (prev.some((m) => String(m._id || m.id) === msgId)) return prev;
        return [...prev, msg];
      });

      onSentOrReceived?.(conversationId, msg);
    };

    s.on('dm:new_message', onNew);

    return () => {
      s.off('dm:new_message', onNew);
      s.emit('dm:leave', { conversationId });
    };
  }, [conversationId, onSentOrReceived]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !conversationId) return;

    setSending(true);
    try {
      const res = await api.post(`/dm/conversations/${conversationId}/messages`, { text: trimmed });
      const msg = res.message;

      setMessages((prev) => [...prev, msg]);
      setText('');

      onSentOrReceived?.(conversationId, msg);
    } finally {
      setSending(false);
    }
  };

  if (!conversationId) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center text-muted-foreground bg-background">
        Select a conversation
      </div>
    );
  }

  const other = conversationMeta?.other;

  return (
    // ✅ subtract navbar height
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-10 w-10">
            <AvatarImage src={other?.profilePic || ''} alt={other?.handle || 'User'} />
            <AvatarFallback>{(other?.handle || '?')[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <div className="font-semibold truncate">@{other?.handle || 'Chat'}</div>
            <div className="text-xs text-muted-foreground truncate">
              {other?.displayName || ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted/30"
            type="button"
            title="Call (not implemented)"
          >
            <Phone className="h-4 w-4 text-muted-foreground" />
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((m) => {
          const id = m._id || m.id;
          const mine = String(m.senderPersonaId) === String(myPersonaId);
          return <MessageBubble key={id} mine={mine} text={m.text} time={m.createdAt} />;
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/40 px-3 py-2">
          <button
            className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted/30"
            type="button"
            title="Emoji (not implemented)"
          >
            <Smile className="h-5 w-5 text-muted-foreground" />
          </button>

          <input
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
  );
}

export default function Messages() {
  const navigate = useNavigate();
  const { conversationId } = useParams();

  const { personas, activeMode } = useAuthStore();
  const myPersonaId = useMemo(() => personas?.[activeMode]?.id, [personas, activeMode]);

  const [conversations, setConversations] = useState([]);

  // ✅ refetch conversations when activeMode changes (public/anon)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // clear old persona’s conversations immediately (prevents flash of wrong inbox)
      setConversations([]);

      try {
        const res = await api.get('/dm/conversations');
        const next = res.conversations || [];

        if (cancelled) return;

        setConversations(next);

        // if current URL conversationId doesn't exist in this mode, go back to inbox root
        if (conversationId && !next.some((c) => c.id === conversationId)) {
          navigate('/messages', { replace: true });
        }
      } catch {
        if (!cancelled) setConversations([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeMode, conversationId, navigate]);

  // ✅ reconnect socket on activeMode change so joins/permissions reflect new active persona
  useEffect(() => {
    disconnectSocket();
    connectSocket();

    return () => {
      disconnectSocket();
    };
  }, [activeMode]);

  const openConversation = (id) => navigate(`/messages/${id}`);

  // ✅ back: go to previous page, fallback to /home when there is no history
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/home');
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === conversationId) || null,
    [conversations, conversationId]
  );

  // update sidebar preview on send/receive
  const bumpConversation = (id, msg) => {
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
  };

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
        <ChatWindow
          conversationId={conversationId}
          myPersonaId={myPersonaId}
          conversationMeta={activeConversation}
          onSentOrReceived={bumpConversation}
        />
      </div>
    </>
  );
}