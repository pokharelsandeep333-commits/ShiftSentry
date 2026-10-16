export const metadata = { title: "Games | ShiftSentry" };

import { GamesView } from "@/components/admin/games-view";
import { requireAdmin } from "@/lib/auth";
import { getLiveRooms } from "@/lib/admin-games";

export const dynamic = "force-dynamic";

export default async function AdminGamesPage() {
  await requireAdmin();
  return <GamesView rooms={await getLiveRooms()} now={new Date()} />;
}
