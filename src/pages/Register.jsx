import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import useAuth from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function RegisterPage() {
  const { user, register, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formState, setFormState] = useState({ username: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (field) => (event) => {
    setFormState((previous) => ({ ...previous, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (formState.password !== formState.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        username: formState.username.trim(),
        password: formState.password
      });

      const redirectTo = location.state?.from?.pathname || '/';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const message = err?.payload?.error || err?.message || 'Unable to create your account. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-emerald-700">
        Preparing the registration form...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-50 px-4 py-8">
      <Card className="w-full max-w-md border-emerald-100 shadow-lg shadow-emerald-100/70">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-bold text-emerald-900">Create your account</CardTitle>
          <CardDescription className="text-emerald-700">
            Join Nutri Scan to track meals, plan workouts, and monitor body measurements securely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-emerald-900">
                Username
              </label>
              <Input
                id="username"
                value={formState.username}
                onChange={handleChange('username')}
                placeholder="Choose a username"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-emerald-900">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={formState.password}
                onChange={handleChange('password')}
                autoComplete="new-password"
                placeholder="Create a strong password"
                required
              />
              <p className="text-xs text-emerald-700/80">Use at least 8 characters, including letters and numbers.</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium text-emerald-900">
                Confirm password
              </label>
              <Input
                id="confirm-password"
                type="password"
                value={formState.confirmPassword}
                onChange={handleChange('confirmPassword')}
                autoComplete="new-password"
                placeholder="Repeat your password"
                required
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2 text-sm text-emerald-800">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-emerald-700 hover:text-emerald-900">
              Sign in instead
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
