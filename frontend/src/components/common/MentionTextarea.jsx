import { useEffect, useMemo, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import api from '@/api/axios';
import {
  findActiveMentionAtCaret,
  findActiveHashtagAtCaret,
  tokenizeRichText,
} from '@/utils/richText';

export default function MentionTextarea({
  value,
  onValueChange,
  placeholder,
  maxLength,
  disabled,
  className = '',
  sanitize,
  autoFocus,

  enableHashtagSuggestions = false,
}) {
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null); // { type: 'mention'|'hashtag', start, end, query }
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const [scrollTop, setScrollTop] = useState(0);

  const q = useMemo(() => (active?.query ?? '').trim(), [active]);

  const getInitials = (h) => (String(h || '').substring(0, 2).toUpperCase() || '?');
  const apply = (s) => (typeof sanitize === 'function' ? sanitize(s) : s);

  const updateActiveFromDom = () => {
    const el = textareaRef.current;
    if (!el) return;

    const caret = el.selectionStart ?? (value?.length || 0);

    const mention = findActiveMentionAtCaret(value || '', caret);
    const hashtag = enableHashtagSuggestions ? findActiveHashtagAtCaret(value || '', caret) : null;

    // pick the one closest to caret (largest start)
    let picked = null;
    if (mention && hashtag) picked = mention.start >= hashtag.start ? { type: 'mention', ...mention } : { type: 'hashtag', ...hashtag };
    else if (mention) picked = { type: 'mention', ...mention };
    else if (hashtag) picked = { type: 'hashtag', ...hashtag };

    if (!picked) {
      setActive(null);
      setOpen(false);
      setResults([]);
      setLoading(false);
      if (abortRef.current) abortRef.current.abort();
      return;
    }

    setActive(picked);

    // open rules:
    // - mentions: open when at least 1 char after @
    // - hashtags: open even when empty after # (show top trends)
    if (picked.type === 'mention') {
      if (picked.query.length >= 1) setOpen(true);
      else {
        setOpen(false);
        setResults([]);
        setLoading(false);
        if (abortRef.current) abortRef.current.abort();
      }
    } else {
      setOpen(true);
    }
  };

  const onChange = (e) => {
    const next = apply(e.target.value);
    onValueChange?.(next);
    queueMicrotask(() => updateActiveFromDom());
  };

  useEffect(() => {
    if (!open || !active) return;

    setLoading(true);

    const t = window.setTimeout(async () => {
      try {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (active.type === 'mention') {
          // no query => do nothing (kept closed by updateActiveFromDom)
          const res = await api.get('/personas/search', {
            params: { q, page: 1, limit: 8 },
            signal: controller.signal,
          });
          setResults(Array.isArray(res?.results) ? res.results : []);
          setHighlight(0);
          return;
        }

        // ✅ hashtag suggestions from trends
        const res = await api.get('/trends', {
          params: { limit: 8, windowDays: 7, ...(q ? { q } : {}) },
          signal: controller.signal,
        });

        setResults(Array.isArray(res?.results) ? res.results : []);
        setHighlight(0);
      } catch (e) {
        if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => window.clearTimeout(t);
  }, [open, active?.type, q]);

  const insertMention = (handle) => {
    if (!active || active.type !== 'mention') return;

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

  const insertHashtag = (tag) => {
    if (!active || active.type !== 'hashtag') return;

    const t = String(tag || '').trim().replace(/^#+/, '').toLowerCase();
    if (!t) return;

    const before = (value || '').slice(0, active.start);
    const after = (value || '').slice(active.end);
    const inserted = `#${t} `;

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
      e.preventDefault();

      const picked = results[highlight];
      if (active?.type === 'mention') {
        const handle = picked?.handle || picked?.username;
        insertMention(handle);
      } else if (active?.type === 'hashtag') {
        insertHashtag(picked?.tag);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  // ✅ highlight layer: mentions always; hashtags only when suggestions enabled (thread/quote composer)
  const tokens = useMemo(
    () => tokenizeRichText(value || '', { enableMentions: true, enableHashtags: !!enableHashtagSuggestions }),
    [value, enableHashtagSuggestions]
  );

  return (
    <div className={`relative ${className}`}>
      {/* Highlight layer */}
      <div
        aria-hidden="true"
        className={[
          'absolute inset-0 px-3 py-2 rounded-md',
          'whitespace-pre-wrap break-words',
          'pointer-events-none select-none',
          'text-sm leading-5',
          disabled ? 'text-muted-foreground' : 'text-foreground',
        ].join(' ')}
      >
        <div style={{ transform: `translateY(-${scrollTop}px)` }}>
          {tokens.map((t, idx) => {
            if (t.type === 'mention') {
              const handle = String(t.value || '').trim();
              return (
                <span key={`m-${handle}-${idx}`} className="text-blue-600 dark:text-blue-400 font-semibold">
                  @{handle}
                </span>
              );
            }
            if (t.type === 'hashtag') {
              const tag = String(t.value || '').trim().toLowerCase();
              return (
                <span key={`h-${tag}-${idx}`} className="text-blue-600 dark:text-blue-400 font-semibold">
                  #{tag}
                </span>
              );
            }
            return <span key={idx}>{t.value}</span>;
          })}
          <span>{'\n'}</span>
        </div>
      </div>

      {/* Real textarea */}
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
        className="relative bg-transparent text-transparent caret-foreground selection:bg-primary/20"
      />

      {/* Dropdown */}
      {open ? (
        <div className="absolute left-0 right-0 mt-2 rounded-lg border bg-background shadow-lg overflow-hidden z-50">
          {loading ? (
            <div className="p-3 text-sm text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              {active?.type === 'hashtag' ? 'No trends found' : 'No matches'}
            </div>
          ) : active?.type === 'hashtag' ? (
            <ul className="max-h-72 overflow-auto">
              {results.map((t, idx) => (
                <li key={`${t?.tag}-${idx}`}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between ${
                      idx === highlight ? 'bg-accent' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertHashtag(t?.tag)}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-blue-600 dark:text-blue-400 truncate">
                        #{t?.tag}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Trending at #{t?.rank ?? ''}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">{t?.count ?? 0}</div>
                  </button>
                </li>
              ))}
            </ul>
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
                      onMouseDown={(e) => e.preventDefault()}
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