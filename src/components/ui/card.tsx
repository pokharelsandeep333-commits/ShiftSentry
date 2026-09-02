import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Deliberately no `backdrop-blur`. Every card carrying one made each card its
 * own compositing layer, so a list page paid for ten-plus simultaneous
 * backdrop-filters -- one of the most expensive things to composite -- on every
 * scroll and hover. Nothing behind a card needs blurring: the page background is
 * a 2.5%-opacity grid, and the login and account-disabled backdrops are already
 * smooth gradients, which a blur cannot change. The blur stays only on the
 * sidebar, header, and bottom bar, which genuinely overlay scrolling content.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("premium-card rounded-[1.35rem] border bg-[var(--card)]/80 transition-[transform,border-color,box-shadow] duration-300", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-5 sm:p-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-display text-[1.05rem] font-semibold", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-[var(--muted-foreground)]", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}
