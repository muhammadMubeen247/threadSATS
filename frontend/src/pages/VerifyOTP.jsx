import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ThemeToggle';
import api from '@/api/axios';

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef([]);

  const email = location.state?.email;

  useEffect(() => {
    if (!email) {
      navigate('/signup');
    }
  }, [email, navigate]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer((t) => t - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError('');
    setInfoMessage('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (!/^\d+$/.test(pastedData)) return;

    const newOtp = ['', '', '', '', '', ''];
    pastedData.split('').forEach((char, idx) => {
      if (idx < 6) newOtp[idx] = char;
    });
    setOtp(newOtp);
    setError('');
    setInfoMessage('');

    const nextIndex = Math.min(pastedData.length, 6) - 1;
    inputRefs.current[Math.max(0, nextIndex)]?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');

    if (otpCode.length !== 6) {
      setError('Please enter complete OTP code');
      return;
    }

    setIsLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const response = await api.post('/auth/verify-otp', { email, otp: otpCode });

      if (response.success) {
        navigate('/login', {
          state: {
            message: 'Email verified successfully! Please login.',
            email,
          },
        });
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Invalid or expired OTP');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!canResend) return;

    setIsLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const response = await api.post('/auth/resend-otp', { email });

      if (response.success) {
        setResendTimer(60);
        setCanResend(false);
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
        setInfoMessage('OTP resent. Check your inbox.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to resend OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Responsive centering:
          - mobile: top aligned with scroll room
          - sm+: centered */}
      <div className="min-h-screen flex items-start sm:items-center justify-center px-4 py-10 sm:py-16">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Verify Your Email</CardTitle>
            <CardDescription className="text-center">
              Enter the 6-digit code sent to
              <br />
              <span className="font-medium text-foreground break-all">{email}</span>
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {error ? (
                <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md text-center">
                  {error}
                </div>
              ) : null}

              {infoMessage ? (
                <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-md text-center">
                  {infoMessage}
                </div>
              ) : null}

              {/* OTP Input */}
              <div className="flex justify-center gap-2 sm:gap-3 flex-wrap">
                {otp.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    className="w-12 h-12 sm:w-14 sm:h-14 text-center text-lg font-semibold"
                    disabled={isLoading}
                    autoFocus={index === 0}
                  />
                ))}
              </div>

              {/* Resend OTP */}
              <div className="text-center text-sm">
                {canResend ? (
                  <button
                    type="button"
                    onClick={handleResendOTP}
                    disabled={isLoading}
                    className="text-primary hover:underline disabled:opacity-50"
                  >
                    Resend OTP
                  </button>
                ) : (
                  <span className="text-muted-foreground">Resend OTP in {resendTimer}s</span>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Verifying...' : 'Verify Email'}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Wrong email?{' '}
                <Link to="/signup" className="text-primary hover:underline">
                  Sign up again
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}