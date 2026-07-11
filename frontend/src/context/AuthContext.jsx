import { useCallback, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/authApi.js';
import { getToken, setToken as persistToken } from '../api/client.js';
import { AuthContext } from './auth-context.js';

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(() => getToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const clearSession = useCallback(() => {
    persistToken(null);
    setTokenState(null);
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => clearSession();
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [clearSession]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    authApi
      .me()
      .then((data) => {
        if (active) setUser(data?.user ?? data);
      })
      .catch(() => {
        if (active) clearSession();
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, clearSession]);

  const login = useCallback(async (credentials) => {
    const result = await authApi.login(credentials);
    if (!result?.token) throw new Error('登录响应缺少 Token');
    persistToken(result.token);
    setTokenState(result.token);
    setUser(result.user ?? null);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Token 清理是退出的可靠降级路径，后端不可用时仍允许退出。
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({ token, user, loading, isAuthenticated: Boolean(token && user), login, logout, clearSession }),
    [token, user, loading, login, logout, clearSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
