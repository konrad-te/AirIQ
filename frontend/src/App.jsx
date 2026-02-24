import { useEffect, useState } from "react";
import SpaLink from "./components/common/SpaLink";
import Landing from "./pages/Landing";
import Room from "./pages/Room";
import SignIn from "./pages/SignIn";

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
          Sidan kunde inte hittas
        </h1>
        <p className="mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-300">
          Kontrollera adressen eller ga tillbaka till startsidan.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <SpaLink
            href="/"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            Till Landing
          </SpaLink>
          <SpaLink
            href="/signin"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Sign in
          </SpaLink>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [pathname, setPathname] = useState(getPathname);

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
      if (url.pathname !== window.location.pathname) {
        window.history.pushState({}, "", url.pathname);
        setPathname(url.pathname);
      }
    };

    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleDocumentClick);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  if (pathname === "/") {
    return <Landing />;
  }

  if (pathname === "/signin") {
    return <SignIn />;
  }

  const roomId = getRoomRoute(pathname);
  if (roomId) {
    return <Room roomId={roomId} />;
  }

  return <NotFound />;
}

export default App;
