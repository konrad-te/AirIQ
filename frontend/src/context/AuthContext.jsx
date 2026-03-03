import { createContext, useContext, useMemo, useState } from "react";

const AUTH_STORAGE_KEY = "airiq_auth";

const AuthContext = createContext(null);

function getInitialAuthState() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY) === "1";
}

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(getInitialAuthState);

  const login = (email, password) => {
    const hasEmail = typeof email === "string" && email.trim().length > 0;
    const hasPassword = typeof password === "string" && password.trim().length > 0;

    if (!hasEmail || !hasPassword) {
      return false;
    }

    setIsAuthenticated(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUTH_STORAGE_KEY, "1");
    }
    return true;
  };

  const logout = () => {
    setIsAuthenticated(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  };

  const value = useMemo(
    () => ({ isAuthenticated, login, logout }),
    [isAuthenticated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
