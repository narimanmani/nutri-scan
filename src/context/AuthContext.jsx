import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  refreshUserSession,
  registerUser,
  loginWithGoogleProfile,
} from '@/api/auth.js';
import { readSession, subscribeToSessionChanges } from '@/lib/session.js';

const AuthContext = createContext({
  user: null,
  isLoading: true,
  login: async () => {},
  loginWithGoogle: async () => {},
  register: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readSession());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const refreshed = await refreshUserSession();
        if (!isMounted) {
          return;
        }
        setUser(refreshed);
      } catch (error) {
        console.warn('Unable to refresh user session', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    const unsubscribe = subscribeToSessionChanges((session) => {
      if (!isMounted) {
        return;
      }
      setUser(session);
    });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  const handleLogin = async (credentials) => {
    const account = await loginUser(credentials);
    setUser(account);
    return account;
  };

  const handleRegister = async (payload) => {
    const account = await registerUser(payload);
    setUser(account);
    return account;
  };

  const handleGoogleLogin = async (profile) => {
    const account = await loginWithGoogleProfile(profile);
    setUser(account);
    return account;
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
  };

  const refresh = async () => {
    const current = await getCurrentUser();
    setUser(current);
    return current;
  };

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login: handleLogin,
      loginWithGoogle: handleGoogleLogin,
      register: handleRegister,
      logout: handleLogout,
      refresh,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
