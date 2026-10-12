"use client";

import "./globals.css";
import { ErrorRecovery } from "@/components/error-recovery";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="en"><body><ErrorRecovery retry={retry} digest={error.digest} /></body></html>;
}
