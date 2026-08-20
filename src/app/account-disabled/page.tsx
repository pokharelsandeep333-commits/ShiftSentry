import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountDisabledPage() {
  return <main className="grid min-h-screen place-items-center p-4"><Card className="w-full max-w-md"><CardHeader><LockKeyhole className="mb-2 size-8 text-[var(--danger)]" /><CardTitle>Your account is disabled</CardTitle><CardDescription>Please contact ShiftSaaS support if you think this is a mistake.</CardDescription></CardHeader><CardContent><Link href="/login"><Button>Return to sign in</Button></Link></CardContent></Card></main>;
}
