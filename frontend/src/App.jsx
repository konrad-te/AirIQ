import { useCallback, useEffect, useState } from "react";
import RequireAuth from "./components/auth/RequireAuth";
import SignInModal from "./components/auth/SignInModal";
import SpaLink from "./components/common/SpaLink";
import { useAuth } from "./context/AuthContext";
import Dashboard from "./pages/Dashboard";
import PublicLanding from "./pages/PublicLanding";
import Room from "./pages/Room";

function getPathname() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.pathname || "/";
}

function getRoomRoute(pathname) {
  const match = pathname.match(/^\/rooms\/([^/]+)$/);
  if (!match) {
    return null;
  }

  return decodeURIComponent(match[1]);
}

function NotFound() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          404
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
          Page not found
        </h1>
        <p className="mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-300">
          Check the URL or return to the public landing.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <SpaLink
            href="/"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            Public landing
          </SpaLink>
          <SpaLink
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Dashboard
          </SpaLink>
        </div>
      </section>
    </main>
  );
}

function App() {
  const { isAuthenticated, logout } = useAuth();
  const [pathname, setPathname] = useState(getPathname);
  const [isSignInOpen, setIsSignInOpen] = useState(false);
  const [postLoginPath, setPostLoginPath] = useState(null);

  const navigate = useCallback((nextPath, options = {}) => {
    if (typeof window === "undefined") {
      return;
    }

    const replace = options.replace === true;
    const currentPath = window.location.pathname || "/";
    if (currentPath !== nextPath) {
      if (replace) {
        window.history.replaceState({}, "", nextPath);
      } else {
        window.history.pushState({}, "", nextPath);
      }
    }

    setPathname(nextPath);
  }, []);

  const openSignInModal = useCallback((options = {}) => {
    setPostLoginPath(options.navigateTo ?? null);
    setIsSignInOpen(true);
  }, []);

  const closeSignInModal = useCallback(() => {
    setIsSignInOpen(false);
    setPostLoginPath(null);
  }, []);

  const handleSignInSuccess = useCallback(() => {
    setIsSignInOpen(false);

    const nextPath = postLoginPath;
    setPostLoginPath(null);
    if (nextPath) {
      navigate(nextPath);
    }
  }, [navigate, postLoginPath]);

  const handleGoDashboard = useCallback(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
      return;
    }

    openSignInModal({ navigateTo: "/dashboard" });
  }, [isAuthenticated, navigate, openSignInModal]);

  const handleUnauthenticated = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(getPathname());
    };

    const handleDocumentClick = (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = event.target.closest("a[data-spa-link]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) {
        return;
      }

      event.preventDefault();
      navigate(url.pathname);
    };

    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleDocumentClick);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [navigate]);

  useEffect(() => {
    if (pathname === "/signin") {
      navigate("/", { replace: true });
    }
  }, [navigate, pathname]);

  const roomId = getRoomRoute(pathname);

  let content = null;
  if (pathname === "/") {
    content = (
      <PublicLanding
        isAuthenticated={isAuthenticated}
        onOpenSignIn={() => openSignInModal()}
        onGoDashboard={handleGoDashboard}
        onLogOut={logout}
      />
    );
  } else if (pathname === "/signin") {
    content = null;
  } else if (pathname === "/dashboard") {
    content = (
      <RequireAuth onUnauthenticated={handleUnauthenticated}>
        <Dashboard />
      </RequireAuth>
    );
  } else if (roomId) {
    content = (
      <RequireAuth onUnauthenticated={handleUnauthenticated}>
        <Room roomId={roomId} />
      </RequireAuth>
    );
  } else {
    content = <NotFound />;
  }

  return (
    <>
      {content}
      <SignInModal
        isOpen={isSignInOpen}
        onClose={closeSignInModal}
        onSuccess={handleSignInSuccess}
      />
    </>
  );
}

export default App;
