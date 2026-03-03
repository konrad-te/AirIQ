import { useEffect } from "react";
import { useAuth } from "../../context/AuthContext";

export default function RequireAuth({ onUnauthenticated, children }) {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      onUnauthenticated();
    }
  }, [isAuthenticated, onUnauthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  return children;
}
