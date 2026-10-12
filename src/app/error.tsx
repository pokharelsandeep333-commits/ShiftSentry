"use client";

import { ErrorRecovery } from "@/components/error-recovery";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorRecovery retry={retry} digest={error.digest} />;
}
