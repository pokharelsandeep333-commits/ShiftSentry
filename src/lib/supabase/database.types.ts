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
      [_ in never]: never;
    };
    Enums: {
      app_role: "USER" | "ADMIN";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
