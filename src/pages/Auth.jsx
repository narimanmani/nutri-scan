import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Leaf } from 'lucide-react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton.jsx';

const ADMIN_HELP_TEXT =
  'An administrator account is pre-configured (username: admin, password: adminNutri!234). Admins can access the Body Measurements Admin tools and view registered users.';

function normalizeUsername(value = '') {
  return value.trim().toLowerCase();
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { user, isLoading, login, loginWithGoogle, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isGoogleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/', { replace: true });
    }
  }, [isLoading, navigate, user]);

  useEffect(() => {
    setError('');
  }, [mode]);

  const isLoginDisabled = useMemo(() => {
    return normalizeUsername(loginForm.username).length === 0 || loginForm.password.trim().length === 0;
  }, [loginForm.password, loginForm.username]);

  const isRegisterDisabled = useMemo(() => {
    return (
      normalizeUsername(registerForm.username).length === 0 ||
      registerForm.password.trim().length < 8 ||
      registerForm.displayName.trim().length === 0
    );
  }, [registerForm.displayName, registerForm.password, registerForm.username]);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting || isLoginDisabled) {
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await login({
        username: loginForm.username,
        password: loginForm.password,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.message || 'Unable to sign in. Check your credentials and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting || isRegisterDisabled) {
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await register({
        username: registerForm.username,
        password: registerForm.password,
        displayName: registerForm.displayName,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.message || 'Unable to create your account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (profile) => {
    setMode('login');
    setError('');
    setIsSubmitting(true);
    try {
      await loginWithGoogle(profile);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.message || 'Unable to sign in with Google.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleError = (err) => {
    setMode('login');
    setError(err?.message || 'Google sign-in was cancelled or failed.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-emerald-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl grid gap-8 lg:grid-cols-[1fr_minmax(0,1.2fr)] items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/70 px-4 py-2 text-sm font-medium text-emerald-700 shadow">
            <Leaf className="h-4 w-4" />
            Nutri Scan Control Center
          </div>
          <h1 className="text-4xl font-bold text-emerald-900 sm:text-5xl">
            Personalised nutrition insights begin with your account
          </h1>
          <p className="text-lg text-emerald-900/80">
            Securely log meals, track body measurements, and manage workouts with data scoped to your profile. Register as a member or sign in with an administrator account to manage organisation-wide defaults.
          </p>
          <Alert className="border-emerald-200 bg-emerald-50/80 text-emerald-900">
            <AlertTitle className="font-semibold">Need administrator access?</AlertTitle>
            <AlertDescription>{ADMIN_HELP_TEXT}</AlertDescription>
          </Alert>
        </div>

        <Card className="border-none shadow-xl shadow-emerald-200/40 bg-white/90 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-2xl text-emerald-900">Access Nutri Scan</CardTitle>
            <CardDescription>Sign in or create an account to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={setMode} className="space-y-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="register">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <div className="space-y-5">
                  <form className="space-y-5" onSubmit={handleLoginSubmit}>
                    <div className="space-y-2">
                      <Label htmlFor="login-username">Username</Label>
                      <Input
                        id="login-username"
                        value={loginForm.username}
                        onChange={(event) =>
                          setLoginForm((prev) => ({ ...prev, username: event.target.value }))
                        }
                        placeholder="e.g. sample_user"
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        value={loginForm.password}
                        onChange={(event) =>
                          setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        placeholder="Enter your password"
                        autoComplete="current-password"
                      />
                    </div>
                    {error && mode === 'login' && (
                      <p className="text-sm text-red-600">{error}</p>
                    )}
                    <Button type="submit" className="w-full" disabled={isSubmitting || isLoginDisabled}>
                      {isSubmitting ? 'Signing in…' : 'Sign in'}
                    </Button>
                  </form>

                  {isGoogleEnabled ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-emerald-900/70">
                        <Separator className="flex-1" />
                        <span>Or continue with</span>
                        <Separator className="flex-1" />
                      </div>
                      <GoogleSignInButton
                        onSuccess={handleGoogleSuccess}
                        onError={handleGoogleError}
                        disabled={isSubmitting}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-900/70 text-center">
                      Google sign-in is not configured. Contact your administrator to enable it.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="register">
                <form className="space-y-5" onSubmit={handleRegisterSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="register-display-name">Display name</Label>
                    <Input
                      id="register-display-name"
                      value={registerForm.displayName}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, displayName: event.target.value }))
                      }
                      placeholder="How should we greet you?"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-username">Username</Label>
                    <Input
                      id="register-username"
                      value={registerForm.username}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, username: event.target.value }))
                      }
                      placeholder="Choose a unique username"
                      autoComplete="username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      value={registerForm.password}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                    />
                  </div>
                  {error && mode === 'register' && (
                    <p className="text-sm text-red-600">{error}</p>
                  )}
                  <Button type="submit" className="w-full" disabled={isSubmitting || isRegisterDisabled}>
                    {isSubmitting ? 'Creating account…' : 'Create account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
