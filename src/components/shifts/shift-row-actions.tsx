"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Copy, MoreHorizontal, Pencil } from "lucide-react";
import { deleteShift } from "@/app/actions/work";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";

type ShiftRowActionsProps = {
  shiftId: string;
  editHref: string;
  /** Absent when the shift's job is archived, which cannot take new shifts. */
  duplicateHref?: string;
  /** How far back the log is loaded, so a delete returns to the same depth. */
  weeks: number;
};

const linkClass = "rounded-lg px-3 py-2 text-xs font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]";
const menuItemClass = "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--primary-soft)] focus:bg-[var(--primary-soft)]";

/**
 * Three actions per row read fine on a desktop table and badly on a phone,
 * where they wrapped onto a line of their own under every shift. Below `sm`
 * they collapse behind one trigger; above it they stay visible, because there
 * is room and a visible control beats a hidden one.
 */
export function ShiftRowActions({ shiftId, editHref, duplicateHref, weeks }: ShiftRowActionsProps) {
  const deleteForm = <form action={deleteShift}>
    <input type="hidden" name="id" value={shiftId} />
    <input type="hidden" name="weeks" value={weeks} />
    <ConfirmSubmit label="Delete" confirmLabel="Delete shift?" />
  </form>;

  return <>
    <div className="hidden items-center gap-1 sm:flex">
      <Link href={editHref} className={linkClass}>Edit</Link>
      {duplicateHref && <Link href={duplicateHref} className={linkClass}>Duplicate</Link>}
      {deleteForm}
    </div>

    <div className="sm:hidden">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label="Shift actions" className="grid size-11 place-items-center rounded-xl text-[var(--muted-foreground)] transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-52 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--card)]/96 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-2xl outline-none">
            <DropdownMenu.Item asChild>
              <Link href={editHref} className={menuItemClass}><Pencil className="size-4 text-[var(--primary)]" />Edit</Link>
            </DropdownMenu.Item>
            {duplicateHref && <DropdownMenu.Item asChild>
              <Link href={duplicateHref} className={menuItemClass}><Copy className="size-4 text-[var(--primary)]" />Duplicate</Link>
            </DropdownMenu.Item>}
            <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
            {/* Deliberately not a DropdownMenu.Item: ConfirmSubmit arms on the
                first click and submits on the second, so it has to survive a
                click that would otherwise select the item and close the menu. */}
            <div className="px-2 py-1">{deleteForm}</div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  </>;
}
