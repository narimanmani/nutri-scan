import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { User as UserApi } from '@/api/entities.js';

const AuthContext = createContext({
  user: null,
  loading: true,
  initializing: true,
  error: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initializing, setInitializing] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await UserApi.getCurrentUser();
      setUser(current);
    } catch (err) {
      console.error('Failed to load current session', err);
      setError(err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setInitializing(false));
  }, [refresh]);

  const login = useCallback(async (credentials) => {
    setLoading(true);
    setError(null);
    try {
      const authenticated = await UserApi.login(credentials);
      setUser(authenticated);
      return authenticated;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (credentials) => {
    setLoading(true);
    setError(null);
    try {
      const created = await UserApi.register(credentials);
      setUser(created);
      return created;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await UserApi.logout();
      setUser(null);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, initializing, error, login, register, logout, refresh }),
    [user, loading, initializing, error, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useAuth() {
  return useContext(AuthContext);
}
