import type { Provider } from "@/lib/oauth";

const LABELS: Record<Provider, string> = {
  google: "Continue with Google",
  facebook: "Continue with Facebook",
  apple: "Continue with Apple",
};

function Icon({ provider }: { provider: Provider }) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
      </svg>
    );
  }
  if (provider === "facebook") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
        <path fill="#fff" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="currentColor" d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.6 1.3-.1 1.7-.8 3.2-.8s1.9.8 3.3.8c1.4 0 2.2-1.3 3-2.5.9-1.4 1.3-2.7 1.3-2.8 0 0-2.6-1-2.6-4.2zM13.9 5.1c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
    </svg>
  );
}

const STYLES: Record<Provider, string> = {
  google: "bg-white text-neutral-800 hover:bg-neutral-100",
  facebook: "bg-[#1877F2] text-white hover:bg-[#166FE5]",
  apple: "bg-black text-white ring-1 ring-inset ring-white/20 hover:bg-neutral-900",
};

/**
 * One-tap sign-in / sign-up buttons. Plain links (full-page redirects) so they
 * work everywhere, including in-app browsers like Messenger and Instagram.
 */
export function SocialSignIn({ providers, next }: { providers: Provider[]; next: string }) {
  if (providers.length === 0) return null;
  const q = next && next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <div className="mt-6">
      <div className="space-y-2.5">
        {providers.map((p) => (
          <a
            key={p}
            href={`/api/auth/oauth/${p}${q}`}
            className={`flex h-11 w-full items-center justify-center gap-2.5 rounded-full text-sm font-semibold transition-colors ${STYLES[p]}`}
          >
            <Icon provider={p} />
            {LABELS[p]}
          </a>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-wider text-white/30">
        <span className="h-px flex-1 bg-white/10" />
        or use email
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}
