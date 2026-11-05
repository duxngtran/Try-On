import { createContext, useContext } from 'react';

/**
 * @typedef {'loading' | 'guest' | 'authenticated' | 'error'} AuthStatus
 * @typedef {{
 *   status: AuthStatus,
 *   user: { id: string, email: string, role: 'user' | 'admin', profileCompleted: boolean } | null,
 *   postAuthTarget: string | null,
 *   login: (credentials: { email: string, password: string }, options?: { from?: unknown }) => Promise<void>,
 *   register: (credentials: { email: string, password: string }) => Promise<void>,
 *   logout: () => void,
 *   retryRestore: () => void,
 *   discardSession: () => void,
 * }} AuthValue
 */

export const AuthContext = createContext(/** @type {AuthValue | null} */ (null));

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth phải được dùng bên trong <AuthProvider>');
  return value;
}
