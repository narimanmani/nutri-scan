import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import useAuth from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const { user, login, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [formState, setFormState] = useState({ username: '', password: '' });
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
    setIsSubmitting(true);

    try {
      await login({
        username: formState.username.trim(),
        password: formState.password
      });

      const redirectTo = location.state?.from?.pathname || '/';
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const message = err?.payload?.error || err?.message || 'Unable to sign in. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-emerald-700">
        Checking your session...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-50 px-4 py-8">
      <Card className="w-full max-w-md border-emerald-100 shadow-lg shadow-emerald-100/70">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-2xl font-bold text-emerald-900">Welcome back</CardTitle>
          <CardDescription className="text-emerald-700">
            Sign in to access your nutrition, workout, and measurement tools.
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
                autoComplete="username"
                placeholder="Enter your username"
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
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold text-emerald-900">Need quick access?</p>
            <p>Try the sample accounts:</p>
            <ul className="mt-2 space-y-1">
              <li>
                <span className="font-medium">User:</span> sample_user / <code>sampleUser234!@</code>
              </li>
              <li>
                <span className="font-medium">Admin:</span> admin / <code>sampleAdmin234!@</code>
              </li>
            </ul>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2 text-sm text-emerald-800">
          <p>
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-semibold text-emerald-700 hover:text-emerald-900">
              Create one now
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
