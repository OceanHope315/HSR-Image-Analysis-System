import { useMemo } from 'react';
import { AuthContext } from './auth-context.js';

const operator = Object.freeze({
  _id: null,
  username: '安检员',
  role: 'inspector',
});

export function AuthProvider({ children }) {
  const value = useMemo(
    () => ({ user: operator, loading: false, isAuthenticated: true }),
    [],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
