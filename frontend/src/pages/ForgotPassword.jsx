import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import api from '@/api/axios';
import { ThemeToggle } from '@/components/ThemeToggle';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { Eye, EyeOff } from 'lucide-react';

export default function ForgotPassword() {
  const navigate = useNavigate();

  // steps: email -> otp -> password
  const [step, setStep] = useState('email');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState({
    email: '',
    otp: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  const trimmedEmail = useMemo(() => form.email.trim(), [form.email]);

  const onChange = (e) => {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
    setInfo('');
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setInfo('');

    try {
      const res = await api.post('/auth/forgot-password', { email: trimmedEmail });
      setInfo(res?.message || 'If an account exists for this email, an OTP has been sent.');
      setStep('otp');
    } catch (err) {
      setError(err?.userMessage || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setInfo('');

    try {
      const res = await api.post('/auth/verify-reset-otp', {
        email: trimmedEmail,
        otp: form.otp.trim(),
      });
      setInfo(res?.message || 'OTP verified');
      setStep('password');
    } catch (err) {
      setError(err?.userMessage || 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setInfo('');

    const np = form.newPassword;
    if (np.length < 6) {
      setIsLoading(false);
      setError('New password must be at least 6 characters.');
      return;
    }
    if (np !== form.confirmNewPassword) {
      setIsLoading(false);
      setError('New password and confirmation do not match.');
      return;
    }

    try {
      const res = await api.post('/auth/reset-password', {
        email: trimmedEmail,
        otp: form.otp.trim(),
        newPassword: np,
      });

      setInfo(res?.message || 'Password reset successfully. You can now log in.');
      // redirect to login after success
      navigate('/login', { replace: true, state: { message: res?.message } });
    } catch (err) {
      setError(err?.userMessage || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      <div className="min-h-screen flex items-start sm:items-center justify-center px-4 py-10 sm:py-16 mt-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Forgot password</CardTitle>
            <CardDescription className="text-center">
              {step === 'email' && 'Enter your email to receive an OTP.'}
              {step === 'otp' && 'Enter the OTP sent to your email.'}
              {step === 'password' && 'Set your new password.'}
            </CardDescription>
          </CardHeader>

          {error ? (
            <div className="px-6">
              <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
                {error}
              </div>
            </div>
          ) : null}

          {info ? (
            <div className="px-6 mt-2">
              <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-md">
                {info}
              </div>
            </div>
          ) : null}

          {step === 'email' ? (
            <form onSubmit={sendOtp}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="fa22-bcs-112@cuilahore.edu.pk"
                    value={form.email}
                    onChange={onChange}
                    required
                    autoComplete="email"
                  />
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Sending…' : 'Send OTP'}
                </Button>

                <Link to="/login" className="text-sm text-primary hover:underline">
                  Back to login
                </Link>
              </CardFooter>
            </form>
          ) : null}

          {step === 'otp' ? (
            <form onSubmit={verifyOtp}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" value={trimmedEmail} disabled />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="otp">OTP</Label>
                  <Input
                    id="otp"
                    name="otp"
                    inputMode="numeric"
                    placeholder="6-digit code"
                    value={form.otp}
                    onChange={onChange}
                    required
                    minLength={6}
                    maxLength={6}
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="ghost" onClick={() => setStep('email')}>
                    Change email
                  </Button>
                  <Button type="button" variant="outline" onClick={sendOtp} disabled={isLoading}>
                    Resend OTP
                  </Button>
                </div>
              </CardContent>

              <CardFooter>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Verifying…' : 'Verify OTP'}
                </Button>
              </CardFooter>
            </form>
          ) : null}

          {step === 'password' ? (
            <form onSubmit={resetPassword}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" value={trimmedEmail} disabled />
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
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="pr-10"
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
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="pr-10"
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

                <Button type="button" variant="ghost" onClick={() => setStep('otp')}>
                  Back to OTP
                </Button>
              </CardContent>

              <CardFooter>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Updating…' : 'Update password'}
                </Button>
              </CardFooter>
            </form>
          ) : null}
        </Card>
      </div>
    </div>
  );
}