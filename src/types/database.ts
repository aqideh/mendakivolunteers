export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole =
  | "volunteer"
  | "support_officer"
  | "content_editor"
  | "publisher"
  | "attendance_manager"
  | "gamification_manager"
  | "auditor"
  | "admin";

export type AccountStatus =
  | "pending_link"
  | "active"
  | "suspended"
  | "closed";

export type LinkCaseStatus =
  | "pending"
  | "needs_review"
  | "resolved"
  | "closed";

export type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
  core: {
    Tables: {
      user_accounts: {
        Row: {
          id: string;
          status: AccountStatus;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          status?: AccountStatus;
          display_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: AccountStatus;
          display_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      volunteers: {
        Row: {
          id: string;
          ymhub_volunteer_id: string;
          auth_user_id: string | null;
          ymhub_status: string | null;
          source_updated_at: string | null;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ymhub_volunteer_id: string;
          auth_user_id?: string | null;
          ymhub_status?: string | null;
          source_updated_at?: string | null;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string | null;
          ymhub_status?: string | null;
          source_updated_at?: string | null;
          last_synced_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          user_id: string;
          role: AppRole;
          granted_by: string | null;
          granted_at: string;
          reason: string | null;
        };
        Insert: {
          user_id: string;
          role: AppRole;
          granted_by?: string | null;
          granted_at?: string;
          reason?: string | null;
        };
        Update: {
          granted_by?: string | null;
          reason?: string | null;
        };
        Relationships: [];
      };
      account_link_cases: {
        Row: {
          id: string;
          auth_user_id: string;
          candidate_ymhub_volunteer_id: string | null;
          status: LinkCaseStatus;
          reason_code: string | null;
          resolution_notes: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          candidate_ymhub_volunteer_id?: string | null;
          status?: LinkCaseStatus;
          reason_code?: string | null;
          resolution_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          candidate_ymhub_volunteer_id?: string | null;
          status?: LinkCaseStatus;
          reason_code?: string | null;
          resolution_notes?: string | null;
          resolved_by?: string | null;
          resolved_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      has_role: {
        Args: { required_role: AppRole };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: AppRole;
      account_status: AccountStatus;
      link_case_status: LinkCaseStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
