"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Copy, MoreHorizontal, Pencil } from "lucide-react";
import { deleteShift } from "@/app/actions/work";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import type { ShiftFilters } from "@/lib/shift-log";

type ShiftRowActionsProps = {
  shiftId: string;
  editHref: string;
  /** Absent when the shift's job is archived, which cannot take new shifts. */
  duplicateHref?: string;
  /** How far back the log is loaded, so a delete returns to the same depth. */
  weeks: number;
  /** The shift comes from a repeating Google event, so deleting can stop the whole series. */
  repeating?: boolean;
  /** The log's filters, so a delete returns to the same filtered view. */
  filters?: ShiftFilters;
};

const menuItemClass = "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--primary-soft)] focus:bg-[var(--primary-soft)]";

/** One action menu on every row; destructive actions retain their confirmation. */
export function ShiftRowActions({ shiftId, editHref, duplicateHref, weeks, repeating = false, filters }: ShiftRowActionsProps) {
  const deleteForm = <form action={deleteShift}>
    <input type="hidden" name="id" value={shiftId} />
    <input type="hidden" name="weeks" value={weeks} />
    {filters && filters.show !== "all" && <input type="hidden" name="show" value={filters.show} />}
    {filters?.job && <input type="hidden" name="job" value={filters.job} />}
    {repeating
      ? <ConfirmSubmit label="Delete" confirmLabel="Delete this repeating shift?" detail="It comes from a repeating Google Calendar event. Deleting only this one leaves the other weeks syncing." confirmActionLabel="Delete only this shift" alternative={{ label: "Delete all upcoming and stop syncing", name: "scope", value: "series" }} />
      : <ConfirmSubmit label="Delete" confirmLabel="Delete shift?" />}
  </form>;

  return <>
    <div>
      {/* Non-modal for the reason account-menu.tsx gives: the scroll lock
          pads <body> for a scrollbar that never goes away. */}
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button type="button" aria-label="Shift actions" className="shift-icon-button">
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className="shift-row-menu z-50 w-52 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--card)]/96 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-2xl outline-none menu-pop">
            <DropdownMenu.Item asChild>
              <Link href={editHref} className={menuItemClass}><Pencil className="size-4 text-[var(--primary)]" />Edit</Link>
            </DropdownMenu.Item>
            {duplicateHref && <DropdownMenu.Item asChild>
              <Link href={duplicateHref} className={menuItemClass}><Copy className="size-4 text-[var(--primary)]" />Duplicate</Link>
            </DropdownMenu.Item>}
            <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
            {/* Deliberately not a DropdownMenu.Item: ConfirmSubmit opens a
                confirmation dialog rather than acting, so it has to survive a
                click that would otherwise select the item and close the menu out
                from under the question. */}
            <div className="px-2 py-1">{deleteForm}</div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  </>;
}
