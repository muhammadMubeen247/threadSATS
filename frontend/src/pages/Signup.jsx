import { useState } from 'react';
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
    regNumber: '',
    password: '',
  });

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    setError('');
  };

  // Derive email from registration number
  const regLower = formData.regNumber.trim().toLowerCase();
  const isValidReg = /^(fa|sp)\d{2}-[a-z]{2,6}-\d{1,6}$/i.test(regLower);
  const derivedEmail = isValidReg ? `${regLower}@cuilahore.edu.pk` : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!isValidReg) {
      setError('Registration number must be like FA22-BCS-000 or SP22-BSE-000');
      setIsLoading(false);
      return;
    }

    try {
      const payload = {
        username: formData.username,
        email: derivedEmail,
        password: formData.password,
      };

      const response = await api.post('/auth/signup', payload);

      if (response.success) {
        navigate('/verify-otp', {
          state: { email: derivedEmail },
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
              Join Personas to connect with your peers, share your thoughts, and explore the community!
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
                  placeholder="Type your username here"
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
                <Label htmlFor="regNumber">Registration Number</Label>
                <Input
                  id="regNumber"
                  name="regNumber"
                  type="text"
                  placeholder="FA22-BCS-000"
                  value={formData.regNumber}
                  onChange={handleChange}
                  required
                  autoComplete="off"
                />
                {isValidReg ? (
                  <p className="text-xs text-muted-foreground">
                    Email: <span className="font-medium">{derivedEmail}</span>
                  </p>
                ) : formData.regNumber.trim() ? (
                  <p className="text-xs text-red-500">
                    Format: FA22-BCS-000 or SP22-BSE-000
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Format: FA22-BCS-000 or SP22-BSE-000
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

              <p className="text-xs text-center text-muted-foreground">
                By signing up, you agree to our{' '}
                <Link to="/terms" className="text-primary hover:underline">
                  Terms &amp; Conditions
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}