"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  chips: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (user: AuthUser, token: string) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function useApiClient() {
  const { token } = useAuth();

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      return fetch(url, { ...options, headers });
    },
    [token]
  );

  return { authFetch };
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("tilt_token");
    const storedUser = localStorage.getItem("tilt_user");
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("tilt_token");
        localStorage.removeItem("tilt_user");
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback((newUser: AuthUser, newToken: string) => {
    localStorage.setItem("tilt_token", newToken);
    localStorage.setItem("tilt_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    localStorage.removeItem("tilt_token");
    localStorage.removeItem("tilt_user");
    setToken(null);
    setUser(null);
    window.location.href = "/";
  }, []);

  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem("tilt_token");
    if (!t) return;
    try {
      const res = await fetch("/api/users/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.user ?? data;
        setUser(updated);
        localStorage.setItem("tilt_user", JSON.stringify(updated));
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
