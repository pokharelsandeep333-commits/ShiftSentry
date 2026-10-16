import "server-only";
import { prisma } from "@/lib/prisma";

export type ModerationSeat = { userId: string; name: string; email: string | null; joinedAt: string; present: boolean };
export type ModerationRoom = {
  id: string;
  code: string;
  status: "LOBBY" | "PLAYING";
  /** The latest round's phase, or null before the first deal. */
  roundStatus: string | null;
  createdAt: Date;
  hostId: string;
  hostEmail: string | null;
  seats: ModerationSeat[];
};

/**
 * Every room that has not ended, for moderation: who is in it, under what
 * names, and what phase it is in. Nothing from inside a round (words, roles,
 * clues, votes) is read: moderation is about names and seats, and the round
 * secrets carry no grant for a reason. Seats are linked to accounts so an
 * admin can go from an abusive name to the account behind it.
 *
 * Raw SQL because Prisma does not model the game tables. Fixed text, no
 * interpolated values.
 */
export async function getLiveRooms(): Promise<ModerationRoom[]> {
  const rows = await prisma.$queryRaw<{ id: string; code: string; status: "LOBBY" | "PLAYING"; round_status: string | null; created_at: Date; host_id: string; host_email: string | null; seats: ModerationSeat[] }[]>`
    select room.id, room.code, room.status::text as status, room.created_at, room.host_id, host.email as host_email,
      (select round.status::text from public.game_rounds round where round.room_id = room.id order by round.round_no desc limit 1) as round_status,
      coalesce((
        select json_agg(json_build_object(
          'userId', seat.user_id, 'name', seat.display_name, 'email', account.email,
          'joinedAt', seat.joined_at, 'present', seat.last_seen_at > now() - interval '20 seconds'
        ) order by seat.joined_at, seat.user_id)
        from public.game_room_players seat left join public.profiles account on account.id = seat.user_id
        where seat.room_id = room.id
      ), '[]'::json) as seats
    from public.game_rooms room
    left join public.profiles host on host.id = room.host_id
    where room.status <> 'ENDED'
    order by room.created_at desc
    limit 100`;
  return rows.map((row) => ({ id: row.id, code: row.code, status: row.status, roundStatus: row.round_status, createdAt: row.created_at, hostId: row.host_id, hostEmail: row.host_email, seats: row.seats }));
}
