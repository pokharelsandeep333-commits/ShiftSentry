export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          target_user_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          target_user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          target_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_events_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      game_clues: {
        Row: {
          clue: string;
          created_at: string;
          id: string;
          pass_no: number;
          round_id: string;
          user_id: string;
        };
        Insert: {
          clue: string;
          created_at?: string;
          id?: string;
          pass_no: number;
          round_id: string;
          user_id: string;
        };
        Update: {
          clue?: string;
          created_at?: string;
          id?: string;
          pass_no?: number;
          round_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_clues_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "game_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_clues_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      game_room_players: {
        Row: {
          display_name: string;
          id: string;
          joined_at: string;
          last_seen_at: string;
          room_id: string;
          user_id: string;
        };
        Insert: {
          display_name: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          room_id: string;
          user_id: string;
        };
        Update: {
          display_name?: string;
          id?: string;
          joined_at?: string;
          last_seen_at?: string;
          room_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_room_players_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "game_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_room_players_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      game_room_used_words: {
        Row: {
          room_id: string;
          used_at: string;
          word_id: number;
        };
        Insert: {
          room_id: string;
          used_at?: string;
          word_id: number;
        };
        Update: {
          room_id?: string;
          used_at?: string;
          word_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_room_used_words_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "game_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_room_used_words_word_id_fkey";
            columns: ["word_id"];
            isOneToOne: false;
            referencedRelation: "game_words";
            referencedColumns: ["id"];
          },
        ];
      };
      game_rooms: {
        Row: {
          category_filter: string | null;
          category_hint: boolean;
          clue_passes: number;
          code: string;
          created_at: string;
          decoy_mode: boolean;
          ended_at: string | null;
          host_id: string;
          id: string;
          imposter_count: number;
          imposter_final_guess: boolean;
          max_players: number;
          status: Database["public"]["Enums"]["game_room_status"];
          updated_at: string;
          imposter_hint: string;
          hide_roles: boolean;
          ban_repeat_clues: boolean;
          discussion_phase: boolean;
          word_difficulty: string;
        };
        Insert: {
          category_filter?: string | null;
          category_hint?: boolean;
          clue_passes?: number;
          code: string;
          created_at?: string;
          decoy_mode?: boolean;
          ended_at?: string | null;
          host_id: string;
          id?: string;
          imposter_count?: number;
          imposter_final_guess?: boolean;
          max_players?: number;
          status?: Database["public"]["Enums"]["game_room_status"];
          updated_at?: string;
          imposter_hint?: string;
          hide_roles?: boolean;
          ban_repeat_clues?: boolean;
          discussion_phase?: boolean;
          word_difficulty?: string;
        };
        Update: {
          category_filter?: string | null;
          category_hint?: boolean;
          clue_passes?: number;
          code?: string;
          created_at?: string;
          decoy_mode?: boolean;
          ended_at?: string | null;
          host_id?: string;
          id?: string;
          imposter_count?: number;
          imposter_final_guess?: boolean;
          max_players?: number;
          status?: Database["public"]["Enums"]["game_room_status"];
          updated_at?: string;
          imposter_hint?: string;
          hide_roles?: boolean;
          ban_repeat_clues?: boolean;
          discussion_phase?: boolean;
          word_difficulty?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_rooms_host_id_fkey";
            columns: ["host_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      game_round_players: {
        Row: {
          eliminated_at: string | null;
          id: string;
          round_id: string;
          turn_order: number;
          user_id: string;
        };
        Insert: {
          eliminated_at?: string | null;
          id?: string;
          round_id: string;
          turn_order: number;
          user_id: string;
        };
        Update: {
          eliminated_at?: string | null;
          id?: string;
          round_id?: string;
          turn_order?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_round_players_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "game_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_round_players_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      game_round_secrets: {
        Row: {
          assigned_word: string | null;
          category_hint_text: string | null;
          role: Database["public"]["Enums"]["game_player_role"];
          round_id: string;
          user_id: string;
        };
        Insert: {
          assigned_word?: string | null;
          category_hint_text?: string | null;
          role: Database["public"]["Enums"]["game_player_role"];
          round_id: string;
          user_id: string;
        };
        Update: {
          assigned_word?: string | null;
          category_hint_text?: string | null;
          role?: Database["public"]["Enums"]["game_player_role"];
          round_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_round_secrets_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "game_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_round_secrets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      game_rounds: {
        Row: {
          category_hint: boolean;
          clue_passes: number;
          current_pass: number;
          decoy_mode: boolean;
          ended_at: string | null;
          id: string;
          imposter_count: number;
          imposter_final_guess: boolean;
          room_id: string;
          round_no: number;
          started_at: string;
          status: Database["public"]["Enums"]["game_round_status"];
          word_id: number;
          caught_user_id: string | null;
          final_guess: string | null;
          outcome: string | null;
          imposter_hint: string;
          hide_roles: boolean;
          ban_repeat_clues: boolean;
          discussion_phase: boolean;
          tiebreak_count: number;
          abandoned_at: string | null;
        };
        Insert: {
          category_hint: boolean;
          clue_passes: number;
          current_pass?: number;
          decoy_mode: boolean;
          ended_at?: string | null;
          id?: string;
          imposter_count: number;
          imposter_final_guess: boolean;
          room_id: string;
          round_no: number;
          started_at?: string;
          status?: Database["public"]["Enums"]["game_round_status"];
          word_id: number;
          caught_user_id?: string | null;
          final_guess?: string | null;
          outcome?: string | null;
          imposter_hint?: string;
          hide_roles?: boolean;
          ban_repeat_clues?: boolean;
          discussion_phase?: boolean;
          tiebreak_count?: number;
          abandoned_at?: string | null;
        };
        Update: {
          category_hint?: boolean;
          clue_passes?: number;
          current_pass?: number;
          decoy_mode?: boolean;
          ended_at?: string | null;
          id?: string;
          imposter_count?: number;
          imposter_final_guess?: boolean;
          room_id?: string;
          round_no?: number;
          started_at?: string;
          status?: Database["public"]["Enums"]["game_round_status"];
          word_id?: number;
          caught_user_id?: string | null;
          final_guess?: string | null;
          outcome?: string | null;
          imposter_hint?: string;
          hide_roles?: boolean;
          ban_repeat_clues?: boolean;
          discussion_phase?: boolean;
          tiebreak_count?: number;
          abandoned_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "game_rounds_caught_user_id_fkey";
            columns: ["caught_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_rounds_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "game_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_rounds_word_id_fkey";
            columns: ["word_id"];
            isOneToOne: false;
            referencedRelation: "game_words";
            referencedColumns: ["id"];
          },
        ];
      };
      game_votes: {
        Row: {
          created_at: string;
          id: string;
          round_id: string;
          target_id: string;
          voter_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          round_id: string;
          target_id: string;
          voter_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          round_id?: string;
          target_id?: string;
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "game_votes_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "game_rounds";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_votes_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_votes_voter_id_fkey";
            columns: ["voter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      game_words: {
        Row: {
          category: string;
          decoy_word: string;
          difficulty: string;
          id: number;
          word: string;
        };
        Insert: {
          category: string;
          decoy_word: string;
          difficulty?: string;
          id?: never;
          word: string;
        };
        Update: {
          category?: string;
          decoy_word?: string;
          difficulty?: string;
          id?: never;
          word?: string;
        };
        Relationships: [];
      };
      job_deductions: {
        Row: {
          created_at: string;
          id: string;
          job_id: string;
          name: string;
          rate_basis_points: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          job_id: string;
          name: string;
          rate_basis_points: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_id?: string;
          name?: string;
          rate_basis_points?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "job_deductions_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          archived_at: string | null;
          color: string;
          created_at: string;
          hourly_rate_cents: number;
          id: string;
          name: string;
          tax_rate_basis_points: number;
          updated_at: string;
          user_id: string;
          weekly_limit_minutes: number | null;
        };
        Insert: {
          archived_at?: string | null;
          color?: string;
          created_at?: string;
          hourly_rate_cents?: number;
          id?: string;
          name: string;
          tax_rate_basis_points?: number;
          updated_at?: string;
          user_id: string;
          weekly_limit_minutes?: number | null;
        };
        Update: {
          archived_at?: string | null;
          color?: string;
          created_at?: string;
          hourly_rate_cents?: number;
          id?: string;
          name?: string;
          tax_rate_basis_points?: number;
          updated_at?: string;
          user_id?: string;
          weekly_limit_minutes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          disabled_at: string | null;
          display_name: string | null;
          email: string;
          global_weekly_limit_minutes: number | null;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          time_zone: string;
          updated_at: string;
          week_starts_on: number;
        };
        Insert: {
          created_at?: string;
          disabled_at?: string | null;
          display_name?: string | null;
          email: string;
          global_weekly_limit_minutes?: number | null;
          id: string;
          role?: Database["public"]["Enums"]["app_role"];
          time_zone?: string;
          updated_at?: string;
          week_starts_on?: number;
        };
        Update: {
          created_at?: string;
          disabled_at?: string | null;
          display_name?: string | null;
          email?: string;
          global_weekly_limit_minutes?: number | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          time_zone?: string;
          updated_at?: string;
          week_starts_on?: number;
        };
        Relationships: [];
      };
      shifts: {
        Row: {
          created_at: string;
          deduction_cents: number;
          deductions_snapshot: Json;
          ends_at: string;
          gross_cents: number;
          hourly_rate_cents: number;
          id: string;
          job_id: string;
          net_cents: number;
          notes: string | null;
          starts_at: string;
          tax_cents: number;
          tax_rate_basis_points: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deduction_cents?: number;
          deductions_snapshot?: Json;
          ends_at: string;
          gross_cents?: number;
          hourly_rate_cents?: number;
          id?: string;
          job_id: string;
          net_cents?: number;
          notes?: string | null;
          starts_at: string;
          tax_cents?: number;
          tax_rate_basis_points?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deduction_cents?: number;
          deductions_snapshot?: Json;
          ends_at?: string;
          gross_cents?: number;
          hourly_rate_cents?: number;
          id?: string;
          job_id?: string;
          net_cents?: number;
          notes?: string | null;
          starts_at?: string;
          tax_cents?: number;
          tax_rate_basis_points?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shifts_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shifts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_game_room: {
        Args: {
          p_display_name?: string | null;
          p_decoy_mode?: boolean;
          p_category_hint?: boolean;
          p_imposter_final_guess?: boolean;
          p_imposter_count?: number;
          p_clue_passes?: number;
          p_max_players?: number;
          p_category_filter?: string | null;
        };
        Returns: string;
      };
      draw_game_word: {
        Args: {
          p_room_id: string;
        };
        Returns: number;
      };
      end_game_room: {
        Args: {
          p_room_id: string;
        };
        Returns: undefined;
      };
      abandon_game_round: {
        Args: {
          p_round_id: string;
        };
        Returns: undefined;
      };
      finish_game_round: {
        Args: {
          p_round_id: string;
        };
        Returns: undefined;
      };
      game_my_round_secret: {
        Args: {
          p_round_id: string;
        };
        Returns: {
          role: string | null;
          assigned_word: string | null;
          hint_text: string | null;
          roles_hidden: boolean;
        }[];
      };
      game_room_scoreboard: {
        Args: {
          p_room_id: string;
        };
        Returns: {
          user_id: string;
          rounds_played: number;
          wins: number;
          imposter_rounds: number;
          imposter_wins: number;
        }[];
      };
      game_round_reveal: {
        Args: {
          p_round_id: string;
        };
        Returns: {
          word: string;
          decoy_word: string;
          category: string;
          imposter_ids: string[];
        }[];
      };
      game_round_turn: {
        Args: {
          p_round_id: string;
        };
        Returns: string;
      };
      game_round_voters: {
        Args: {
          p_round_id: string;
        };
        Returns: string[];
      };
      game_room_version: {
        Args: {
          p_room_id: string;
        };
        Returns: string;
      };
      game_word_categories: {
        Args: {
          p_difficulty?: string;
        };
        Returns: {
          category: string;
          word_count: number;
        }[];
      };
      generate_game_room_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      is_game_room_member: {
        Args: {
          p_room_id: string;
        };
        Returns: boolean;
      };
      is_game_round_member: {
        Args: {
          p_round_id: string;
        };
        Returns: boolean;
      };
      kick_game_player: {
        Args: {
          p_room_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      join_game_room: {
        Args: {
          p_code: string;
          p_display_name?: string | null;
        };
        Returns: string;
      };
      leave_game_room: {
        Args: {
          p_room_id: string;
        };
        Returns: undefined;
      };
      open_game_round_vote: {
        Args: {
          p_round_id: string;
        };
        Returns: undefined;
      };
      reroll_game_word: {
        Args: {
          p_round_id: string;
        };
        Returns: undefined;
      };
      poll_game_room: {
        Args: {
          p_room_id: string;
        };
        Returns: string;
      };
      resolve_game_round: {
        Args: {
          p_round_id: string;
        };
        Returns: undefined;
      };
      shift_week_count_before: {
        Args: {
          p_time_zone: string;
          p_week_starts_on: number;
          p_before: string;
        };
        Returns: number;
      };
      start_game_round: {
        Args: {
          p_room_id: string;
        };
        Returns: string;
      };
      submit_game_clue: {
        Args: {
          p_round_id: string;
          p_clue: string;
        };
        Returns: undefined;
      };
      submit_game_final_guess: {
        Args: {
          p_round_id: string;
          p_guess: string;
        };
        Returns: undefined;
      };
      submit_game_vote: {
        Args: {
          p_round_id: string;
          p_target_id: string;
        };
        Returns: undefined;
      };
      touch_game_presence: {
        Args: {
          p_room_id: string;
        };
        Returns: undefined;
      };
      update_game_room_settings: {
        Args: {
          p_room_id: string;
          p_imposter_hint: string;
          p_hide_roles: boolean;
          p_imposter_final_guess: boolean;
          p_imposter_count: number;
          p_clue_passes: number;
          p_max_players: number;
          p_ban_repeat_clues: boolean;
          p_discussion_phase: boolean;
          p_word_difficulty: string;
          p_category_filter?: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "USER" | "ADMIN";
      game_player_role: "CREW" | "IMPOSTER";
      game_room_status: "LOBBY" | "PLAYING" | "ENDED";
      game_round_status: "DEALING" | "CLUES" | "DISCUSSION" | "VOTING" | "GUESSING" | "REVEAL" | "ENDED";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
