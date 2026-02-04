import { useEffect, useMemo, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import api from '@/api/axios';
import { findActiveMentionAtCaret, tokenizeMentions } from '@/utils/richText';

export default function MentionTextarea({
  value,
  onValueChange,
  placeholder,
  maxLength,
  disabled,
  className = '',
  sanitize, // optional (e.g. strip bidi)
  autoFocus,
}) {
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null); // { start, end, query }
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // scroll sync for overlay
  const [scrollTop, setScrollTop] = useState(0);

  const q = useMemo(() => (active?.query ?? '').trim(), [active]);

  const getInitials = (h) => (String(h || '').substring(0, 2).toUpperCase() || '?');

  const apply = (s) => (typeof sanitize === 'function' ? sanitize(s) : s);

  const updateActiveFromDom = () => {
    const el = textareaRef.current;
    if (!el) return;

    const caret = el.selectionStart ?? (value?.length || 0);
    const found = findActiveMentionAtCaret(value || '', caret);

    if (!found) {
      setActive(null);
      setOpen(false);
      setResults([]);
      setLoading(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }

    setActive(found);

    // only open suggestions if user typed at least 1 char after @
    if (found.query.length >= 1) setOpen(true);
    else {
      setOpen(false);
      setResults([]);
      setLoading(false);
      if (abortRef.current) abortRef.current.abort();
    }
  };

  const onChange = (e) => {
    const next = apply(e.target.value);
    onValueChange?.(next);

    // update active mention after value updates
    queueMicrotask(() => updateActiveFromDom());
  };

  useEffect(() => {
    if (!open || !active || q.length < 1) return;

    setLoading(true);

    const t = window.setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await api.get('/personas/search', {
          params: { q, page: 1, limit: 8 },
          signal: controller.signal,
        });

        const arr = Array.isArray(res?.results) ? res.results : [];
        setResults(arr);
        setHighlight(0);
      } catch (e) {
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => window.clearTimeout(t);
  }, [open, q, active]);

  const insertMention = (handle) => {
    if (!active) return;

    const h = String(handle || '').trim().replace(/^@+/, '');
    if (!h) return;

    const before = (value || '').slice(0, active.start);
    const after = (value || '').slice(active.end);
    const inserted = `@${h} `;

    const next = apply(before + inserted + after);
    onValueChange?.(next);

    setOpen(false);
    setResults([]);

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = (before + inserted).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e) => {
    if (!open || !results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      // only intercept Enter if mention dropdown is open
      e.preventDefault();
      const p = results[highlight];
      const handle = p?.handle || p?.username;
      insertMention(handle);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const tokens = useMemo(() => tokenizeMentions(value || ''), [value]);

  return (
    <div className="relative">
      {/* ✅ Highlight layer (behind textarea) */}
      <div
        aria-hidden="true"
        className={[
          'absolute inset-0 px-3 py-2 rounded-md',
          'whitespace-pre-wrap break-words',
          'pointer-events-none select-none',
          // keep it visually aligned with Textarea
          'text-sm leading-5',
          disabled ? 'text-muted-foreground' : 'text-foreground',
        ].join(' ')}
      >
        <div style={{ transform: `translateY(-${scrollTop}px)` }}>
          {tokens.map((t, idx) => {
            if (t.type === 'mention') {
              const handle = String(t.handle || '').trim();
              return (
                <span
                  key={`${handle}-${idx}`}
                  className="text-primary font-semibold bg-primary/10 rounded px-1"
                >
                  @{handle}
                </span>
              );
            }
            return <span key={idx}>{t.value}</span>;
          })}
          {/* keep final newline height consistent */}
          <span>{'\n'}</span>
        </div>
      </div>

      {/* ✅ Real textarea on top (transparent text, visible caret) */}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onClick={updateActiveFromDom}
        onKeyUp={updateActiveFromDom}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        autoFocus={autoFocus}
        className={[
          // show overlay text instead of textarea text
          'relative bg-transparent text-transparent caret-foreground',
          // selection still visible
          'selection:bg-primary/20',
          className,
        ].join(' ')}
      />

      {/* Dropdown */}
      {open ? (
        <div className="absolute left-0 right-0 mt-2 rounded-lg border bg-background shadow-lg overflow-hidden z-50">
          {loading ? (
            <div className="p-3 text-sm text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No matches</div>
          ) : (
            <ul className="max-h-72 overflow-auto">
              {results.map((p, idx) => {
                const handle = p?.handle || p?.username;
                const displayName = p?.displayName || handle || 'Profile';
                const typeLabel = p?.type === 'anon' ? 'Anon' : 'Public';

                return (
                  <li key={p?.id || handle || idx}>
                    <button
                      type="button"
                      className={`w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-3 ${
                        idx === highlight ? 'bg-accent' : ''
                      }`}
                      onMouseDown={(e) => e.preventDefault()} // keep focus
                      onClick={() => insertMention(handle)}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={p?.profilePic || ''} alt={handle || 'profile'} />
                        <AvatarFallback>{getInitials(handle)}</AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          @{handle}{' '}
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground align-middle">
                            {typeLabel}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{displayName}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}