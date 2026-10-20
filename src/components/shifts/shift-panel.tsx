"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useId, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShiftPanel({ children, title }: { children: ReactNode; title: string }) {
  const titleId = useId();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const closingRef = useRef(false);
  const widthRef = useRef(420);
  const [maximumWidth, setMaximumWidth] = useState(720);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const transitionFrom = useRef<DOMRect | null>(null);
  const expansionAnimation = useRef<Animation | null>(null);
  const hasOpened = useRef(false);
  const [closing, setClosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [docked, setDocked] = useState(false);
  const [compact, setCompact] = useState(false);
  const [panelWidth, setPanelWidth] = useState(420);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => router.push("/shifts"), 210);
  }, [router]);

  const resize = useCallback((requested: number, commit: boolean) => {
    const split = dialog.current?.closest<HTMLElement>(".shift-workspace");
    if (split) {
      const bounds = split.getBoundingClientRect();
      split.style.setProperty("--shift-workspace-left", `${bounds.left}px`);
      split.style.setProperty("--shift-workspace-right", `${window.innerWidth - bounds.right}px`);
      split.style.setProperty("--shift-workspace-width", `${bounds.width}px`);
      const header = document.querySelector(".app-frame header");
      split.style.setProperty("--shift-panel-top", `${Math.max(0, header?.getBoundingClientRect().bottom ?? 72) + 16}px`);
    }
    if (window.innerWidth < 1200) return;
    const maximum = Math.max(360, Math.min(720, (split?.clientWidth ?? window.innerWidth) - 440));
    const next = Math.round(Math.max(360, Math.min(maximum, requested)));
    widthRef.current = next;
    split?.style.setProperty("--shift-panel-width", `${next}px`);
    if (commit) { setPanelWidth(next); setMaximumWidth(maximum); }
  }, []);

  useLayoutEffect(() => {
    const query = window.matchMedia("(min-width: 1200px)");
    const phone = window.matchMedia("(max-width: 639px)");
    const update = () => { setDocked(query.matches); setCompact(phone.matches); };
    update();
    query.addEventListener("change", update);
    phone.addEventListener("change", update);
    const split = dialog.current?.closest<HTMLElement>(".shift-workspace");
    const observer = new ResizeObserver(() => resize(widthRef.current, true));
    if (split) observer.observe(split);
    return () => { query.removeEventListener("change", update); phone.removeEventListener("change", update); observer.disconnect(); };
  }, [resize]);

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const modal = compact || (!docked && !expanded);
    const focused = node.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    if (node.open && node.matches(":modal") !== modal) node.close();
    if (!node.open) { if (modal) node.showModal(); else node.show(); }
    if (!hasOpened.current) {
      hasOpened.current = true;
      expansionAnimation.current = node.animate([
        { opacity: 0, transform: "translateX(calc(100% + 24px))" },
        { opacity: 1, transform: "none" },
      ], { duration: 340, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    }
    (focused ?? Array.from(node.querySelectorAll<HTMLButtonElement>("button")).find(button => button.getClientRects().length > 0))?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [compact, docked, expanded]);

  useLayoutEffect(() => {
    const node = dialog.current;
    const from = transitionFrom.current;
    if (!node || !from) return;
    transitionFrom.current = null;
    const to = node.getBoundingClientRect();
    expansionAnimation.current = node.animate([
      { transformOrigin: "top left", transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transformOrigin: "top left", transform: "none" },
    ], { duration: 360, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }, [expanded]);

  function toggleExpanded() {
    transitionFrom.current = dialog.current?.getBoundingClientRect() ?? null;
    expansionAnimation.current?.cancel();
    setExpanded(value => !value);
  }

  useEffect(() => {
    const node = dialog.current;
    const opener = document.querySelector<HTMLElement>('header a[href="/shifts/new"]');
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || !node?.contains(document.activeElement)) return;
      if (node.querySelector('[role="listbox"], [role="dialog"], [aria-expanded="true"]')) return;
      event.preventDefault(); close();
    }
    document.addEventListener("keydown", escape);
    return () => {
      window.clearTimeout(closeTimer.current);
      expansionAnimation.current?.cancel();
      document.removeEventListener("keydown", escape);
      document.documentElement.classList.remove("resizing-shift-panel");
      requestAnimationFrame(() => opener?.focus());
    };
  }, [close]);

  return <dialog ref={dialog} aria-labelledby={titleId} data-docked={docked ? "true" : undefined} className={`shift-drawer ${expanded ? "is-expanded" : ""} ${closing ? "is-closing" : ""}`}
    onKeyDown={event => {
      if (event.key !== "Tab" || !event.currentTarget.matches(":modal")) return;
      const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(element => element.getClientRects().length > 0);
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onCancel={event => { event.preventDefault(); close(); }}>
    {docked && !expanded && <div className="shift-panel-resizer" role="separator" tabIndex={0} aria-label="Resize shift panel" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={maximumWidth} aria-valuenow={panelWidth} aria-valuetext={`${panelWidth} pixels wide. Drag or use left and right arrow keys.`}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { startX: event.clientX, startWidth: widthRef.current };
        document.documentElement.classList.add("resizing-shift-panel");
      }}
      onPointerMove={event => { const drag = dragRef.current; if (drag) resize(drag.startWidth + drag.startX - event.clientX, false); }}
      onPointerUp={event => { if (!dragRef.current) return; dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); document.documentElement.classList.remove("resizing-shift-panel"); resize(widthRef.current, true); }}
      onPointerCancel={() => { dragRef.current = null; document.documentElement.classList.remove("resizing-shift-panel"); resize(widthRef.current, true); }}
      onDoubleClick={() => resize(420, true)}
      onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); resize(event.key === "Home" ? 360 : event.key === "End" ? 720 : widthRef.current + (event.key === "ArrowLeft" ? 16 : -16), true);
      }}><span aria-hidden="true" /></div>}
    <div className="shift-drawer-scroll"><div className="shift-log shift-editor"><div className="shift-editor-frame"><div className="shift-editor-card">
      <div className="shift-editor-heading"><h1 id={titleId}>{title}</h1><div className="drawer-heading-actions">
        <Button type="button" variant="ghost" size="icon" onClick={toggleExpanded} aria-label={expanded ? "Return to side panel" : "Expand to page view"} title={expanded ? "Return to side panel" : "Expand to page view"}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</Button>
        <Button type="button" variant="ghost" size="icon" onClick={close} aria-label="Close shift form" title="Close"><X size={18} /></Button>
      </div></div>
      {children}
    </div></div></div></div>
  </dialog>;
}
