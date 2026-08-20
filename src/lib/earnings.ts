export type DeductionSnapshot = { name: string; rateBasisPoints: number };
export type PaySnapshot = {
  hourlyRateCents: number;
  taxRateBasisPoints: number;
  deductions: DeductionSnapshot[];
};
export type Earnings = { grossCents: number; taxCents: number; deductionCents: number; netCents: number };

export function parseMoneyToCents(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const dollars = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = dollars * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

export function parsePercentToBasisPoints(value: string) {
  const match = value.trim().match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const total = whole * 100 + fraction;
  return total <= 10_000 ? total : null;
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function calculateEarnings(minutes: number, snapshot: PaySnapshot): Earnings {
  const workedMinutes = Math.max(0, Math.floor(minutes));
  const grossCents = Math.round((workedMinutes * snapshot.hourlyRateCents) / 60);
  const taxCents = Math.round((grossCents * snapshot.taxRateBasisPoints) / 10_000);
  const deductionCents = snapshot.deductions.reduce((total, deduction) => total + Math.round((grossCents * deduction.rateBasisPoints) / 10_000), 0);
  return { grossCents, taxCents, deductionCents, netCents: Math.max(0, grossCents - taxCents - deductionCents) };
}

export function totalDeductionRate(deductions: DeductionSnapshot[]) {
  return deductions.reduce((total, deduction) => total + deduction.rateBasisPoints, 0);
}
