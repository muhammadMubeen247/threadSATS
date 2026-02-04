import { useEffect, useState } from 'react';
import api from '@/api/axios';
import { Button } from '@/components/ui/button';
import MentionTextarea from '@/components/common/MentionTextarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function QuoteRepostModal({ open, onClose, threadId, onCreated }) {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setText('');
    setError('');
    setIsLoading(false);
  }, [open]);

  const submit = async () => {
    const content = text.trim();
    if (!content) {
      setError('Quote content is required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await api.post(`/threads/${threadId}/quote`, { content });
      const created = res?.thread;
      if (created) onCreated?.(created);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to quote repost');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose?.() : null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="sr-only">Quote repost</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="font-semibold">Quote repost</div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <MentionTextarea
            value={text}
            onValueChange={setText}
            placeholder="Add a comment..."
            maxLength={500}
            disabled={isLoading}
            className="min-h-[120px]"
            autoFocus
            enableHashtagSuggestions // ✅
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={isLoading || !text.trim()}>
              {isLoading ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}