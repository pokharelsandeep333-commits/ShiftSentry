"use client";

import * as React from "react";

type ToastEntry = { id: number; message: string; leaving: boolean };

type ToastContextValue = {
  toast: (message: string) => void;
};

/** How long a toast stays before it starts leaving. */
const VISIBLE_MS = 3000;
/** Must match the toast-out keyframe duration in globals.css. */
const EXIT_MS = 180;

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * Minimal toast stack for confirming server action mutations. Deliberately not
 * a library: a context, a fixed container, and two CSS keyframes. Toasts are
 * polite status messages, so the region is aria-live="polite" rather than an
 * alert.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([]);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = React.useRef(0);

  React.useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); }, []);

  const toast = React.useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const id = nextId.current++;

    setToasts((current) => [...current, { id, message: trimmed, leaving: false }]);
    timers.current.push(setTimeout(() => {
      setToasts((current) => current.map((entry) => entry.id === id ? { ...entry, leaving: true } : entry));
      timers.current.push(setTimeout(() => setToasts((current) => current.filter((entry) => entry.id !== id)), EXIT_MS));
    }, VISIBLE_MS));
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return <ToastContext.Provider value={value}>
    {children}
    <div aria-live="polite" className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col items-end gap-2">
      {toasts.map((entry) => <div key={entry.id} className="pointer-events-auto flex w-full items-start gap-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--card)]/96 px-4 py-3 text-sm font-medium shadow-2xl shadow-black/20 backdrop-blur-xl" style={{ animation: `${entry.leaving ? "toast-out 180ms ease-in forwards" : "toast-in 220ms cubic-bezier(0.16,1,0.3,1)"}` }}>
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--primary)]" />
        <span className="leading-6">{entry.message}</span>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}
