import SpaLink from "../components/common/SpaLink";
import ThemeToggleButton from "../components/common/ThemeToggleButton";
import useTheme from "../hooks/useTheme";

export default function SignIn() {
  const { theme, toggleTheme } = useTheme();

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="flex items-center justify-between">
          <SpaLink
            href="/"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Back to landing
          </SpaLink>
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            Transparent sign in
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">Sign in (preview)</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Authentication is intentionally not connected in this implementation slice.
          </p>

          <form className="mt-5 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">Email</label>
              <input
                type="email"
                placeholder="name@company.com"
                disabled
                className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">Password</label>
              <input
                type="password"
                placeholder="********"
                disabled
                className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
              />
            </div>
            <button
              type="button"
              disabled
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              Continue (coming soon)
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
