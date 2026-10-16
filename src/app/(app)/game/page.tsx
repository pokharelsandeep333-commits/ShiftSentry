export const metadata = { title: "Game rooms | ShiftSentry" };

import { GameHome } from "@/components/game/game-home";
import { requireUser } from "@/lib/auth";
import { fetchActiveRoomCode } from "@/lib/game-lobby";

export const dynamic = "force-dynamic";

const SAVED_MESSAGES: Record<string, string> = {
  "room-left": "You left the game",
  "room-ended": "Game ended",
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function GamePage({ searchParams }: { searchParams: Promise<{ saved?: string | string[]; code?: string | string[] }> }) {
  const [profile, { saved, code }] = await Promise.all([requireUser(), searchParams]);
  const activeCode = await fetchActiveRoomCode();
  // The same fallback chain as the database, so the sentence on the create card
  // names the seat you will actually get.
  const playingAs = profile.display_name?.trim() || profile.email.split("@")[0];
  const savedMessage = SAVED_MESSAGES[first(saved)];
  // `/game?code=ABC234` lands with the box filled; joining still takes a tap.
  const initialCode = first(code) || null;

  return <GameHome activeCode={activeCode} playingAs={playingAs} initialCode={initialCode} savedMessage={savedMessage} />;
}
