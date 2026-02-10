import { useState } from 'react';
import api from '@/api/axios';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Eye, EyeOff } from 'lucide-react';

export default function ChangePasswordPanel() {
  const [isLoading, setIsLoading] = useState(false);

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  const onChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
    setSuccessMessage('');
  };

  const validate = () => {
    if (!form.oldPassword || !form.newPassword) return 'Old and new password are required.';
    if (form.newPassword.length < 6) return 'New password must be at least 6 characters.';
    if (form.newPassword !== form.confirmNewPassword) return 'New password and confirmation do not match.';
    if (form.oldPassword === form.newPassword) return 'New password must be different from old password.';
    return '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/auth/change-password', {
        oldPassword: form.oldPassword,
        newPassword: form.newPassword,
      });

      if (res?.success) {
        setSuccessMessage(res?.message || 'Password updated successfully');
        setForm({ oldPassword: '', newPassword: '', confirmNewPassword: '' });
      } else {
        setError(res?.message || 'Failed to update password');
      }
    } catch (err) {
      setError(err?.userMessage || err?.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Update your password by providing your current one.</CardDescription>
      </CardHeader>

      <CardContent>
        {successMessage ? (
          <div className="mb-4 p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-md">
            {successMessage}
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="oldPassword">Old password</Label>
            <div className="relative">
              <Input
                id="oldPassword"
                name="oldPassword"
                type={showOld ? 'text' : 'password'}
                value={form.oldPassword}
                onChange={onChange}
                autoComplete="current-password"
                className="pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                aria-label={showOld ? 'Hide old password' : 'Show old password'}
                onClick={() => setShowOld((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                name="newPassword"
                type={showNew ? 'text' : 'password'}
                value={form.newPassword}
                onChange={onChange}
                autoComplete="new-password"
                className="pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmNewPassword">Confirm new password</Label>
            <div className="relative">
              <Input
                id="confirmNewPassword"
                name="confirmNewPassword"
                type={showConfirm ? 'text' : 'password'}
                value={form.confirmNewPassword}
                onChange={onChange}
                autoComplete="new-password"
                className="pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
            {isLoading ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}