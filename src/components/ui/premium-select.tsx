"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

type PremiumSelectProps = {
  name: string;
  defaultValue: string;
  options: SelectOption[];
  labelledBy: string;
  required?: boolean;
  className?: string;
};

export function PremiumSelect({ name, defaultValue, options, labelledBy, required = false, className }: PremiumSelectProps) {
  return <Select.Root name={name} defaultValue={defaultValue} required={required}>
    <Select.Trigger
      aria-labelledby={labelledBy}
      className={cn("field-control group flex items-center justify-between gap-3 text-left text-sm font-medium data-[placeholder]:text-[var(--muted-foreground)]", className)}
    >
      <Select.Value />
      <Select.Icon asChild>
        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
          <ChevronDown className="size-4 transition-transform duration-300 group-data-[state=open]:rotate-180" />
        </span>
      </Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content position="popper" sideOffset={8} className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[1.15rem] border border-[color-mix(in_srgb,var(--primary)_24%,var(--border))] bg-[var(--card)]/96 p-1.5 text-[var(--foreground)] shadow-2xl shadow-black/20 backdrop-blur-xl data-[state=closed]:animate-[select-out_180ms_ease-in] data-[state=open]:animate-[select-in_220ms_cubic-bezier(0.16,1,0.3,1)]">
        <Select.Viewport className="max-h-64 p-0.5">
          {options.map((option) => <Select.Item key={option.value} value={option.value} className="relative flex cursor-pointer select-none items-center rounded-xl py-2.5 pl-3 pr-9 text-sm font-medium outline-none transition-colors data-[highlighted]:bg-[var(--primary-soft)] data-[highlighted]:text-[var(--primary)] data-[state=checked]:bg-[var(--primary-soft)]">
            <Select.ItemText>{option.label}</Select.ItemText>
            <Select.ItemIndicator className="absolute right-3 inline-flex items-center text-[var(--primary)]"><Check className="size-4" strokeWidth={2.5} /></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
