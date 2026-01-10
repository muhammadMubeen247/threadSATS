import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
import { ThemeToggle } from '@/components/ThemeToggle';
import api from '@/api/axios';

export default function Signup() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    setError('');
  };

  // Optional UX: show what will be derived from email (frontend-only preview)
  const emailPreview = useMemo(() => {
    const email = formData.email.trim().toLowerCase();
    const m = email.match(/^(fa|sp)(\d{2})-([a-z]{2,6})-(\d{1,6})@cuilahore\.edu\.pk$/i);
    if (!m) return null;

    const session = m[1].toUpperCase() + m[2]; // FA22 / SP22
    const degree = m[3].toUpperCase(); // BCS / BSE
    const id = m[4];
    return {
      batch: session,
      rollNumber: `${session}-${degree}-${id}`,
      degree,
    };
  }, [formData.email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const payload = {
        username: formData.username,
        email: formData.email,
        password: formData.password,
      };

      const response = await api.post('/auth/signup', payload);

      if (response.success) {
        navigate('/verify-otp', {
          state: { email: formData.email },
        });
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create account');
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
            <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
            <CardDescription className="text-center">
              Join Bark - COMSATS Social Network
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  placeholder="johndoe"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-z0-9]+"
                  title="Lowercase letters and numbers only"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">COMSATS Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="fa22-bcs-112@cuilahore.edu.pk"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                />

                {emailPreview ? (
                  <p className="text-xs text-muted-foreground">
                    Detected: <span className="font-medium">{emailPreview.rollNumber}</span> • Batch{' '}
                    <span className="font-medium">{emailPreview.batch}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Format: fa22-bcs-112@cuilahore.edu.pk (or sp22-bse-112@cuilahore.edu.pk)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Creating account...' : 'Sign up'}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="text-primary hover:underline">
                  Log in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}