import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

interface AuthState {
  isAuthenticated: boolean;
  badgeId: string;
  callsign: string;
}

interface AuthContextType {
  auth: AuthState;
  login: (badgeId: string, callsign: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  auth: { isAuthenticated: false, badgeId: '', callsign: '' },
  login: () => {},
  logout: () => {},
});

const STORAGE_KEY = 'sapd_auth';

function loadAuth(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { isAuthenticated: false, badgeId: '', callsign: '' };
}

function saveAuth(state: AuthState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadAuth);

  const login = useCallback((badgeId: string, callsign: string) => {
    const next = { isAuthenticated: true, badgeId, callsign };
    setAuth(next);
    saveAuth(next);
  }, []);

  const logout = useCallback(() => {
    const next = { isAuthenticated: false, badgeId: '', callsign: '' };
    setAuth(next);
    saveAuth(next);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Wraps children — redirects to /login if not authenticated */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  if (!auth.isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
