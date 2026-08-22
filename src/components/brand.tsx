import { cn } from "@/lib/utils";

type BrandSize = "compact" | "default" | "large";

const markSizeClasses: Record<BrandSize, string> = {
  compact: "size-8 rounded-xl",
  default: "size-10 rounded-2xl",
  large: "size-11 rounded-2xl",
};

const iconSizeClasses: Record<BrandSize, string> = {
  compact: "size-4",
  default: "size-5",
  large: "size-5",
};

const wordmarkSizeClasses: Record<BrandSize, string> = {
  compact: "text-base",
  default: "text-lg",
  large: "text-xl",
};

export function BrandMark({ className, iconClassName, size = "default", tone = "default" }: { className?: string; iconClassName?: string; size?: BrandSize; tone?: "default" | "inverse" }) {
  return <span aria-hidden="true" className={cn(
    "grid shrink-0 place-items-center",
    markSizeClasses[size],
    tone === "inverse" ? "border border-white/20 bg-white/15 text-white shadow-xl shadow-violet-950/15" : "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-glow)]",
    className,
  )}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={cn(iconSizeClasses[size], iconClassName)}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  </span>;
}

export function Brand({ className, markClassName, size = "default", tone = "default" }: { className?: string; markClassName?: string; size?: BrandSize; tone?: "default" | "inverse" }) {
  return <span className={cn("flex min-w-0 items-center gap-3 font-display font-semibold tracking-tight", wordmarkSizeClasses[size], tone === "inverse" ? "text-white" : "text-[var(--foreground)]", className)}>
    <BrandMark className={markClassName} size={size} tone={tone} />
    <span className="truncate whitespace-nowrap">ShiftSentry</span>
  </span>;
}

export function BrandMarkSvg({ size, color = "#ffffff" }: { size: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
  </svg>;
}
