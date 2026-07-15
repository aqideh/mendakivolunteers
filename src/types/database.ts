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

export type ContentStatus =
  | "draft"
  | "in_review"
  | "scheduled"
  | "published"
  | "archived";

export type ContentKind = "opportunity" | "news";

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
      is_current_account_active: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      can_support_volunteers: {
        Args: Record<never, never>;
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
  content: {
    Tables: {
      opportunities: {
        Row: {
          id: string;
          slug: string;
          title: string;
          summary: string;
          body: string;
          category: string;
          location_name: string | null;
          is_remote: boolean;
          starts_at: string;
          ends_at: string | null;
          registration_deadline: string | null;
          registration_url: string;
          ymhub_activity_id: string | null;
          featured: boolean;
          status: ContentStatus;
          publish_at: string | null;
          published_at: string | null;
          expires_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          summary: string;
          body: string;
          category: string;
          location_name?: string | null;
          is_remote?: boolean;
          starts_at: string;
          ends_at?: string | null;
          registration_deadline?: string | null;
          registration_url: string;
          ymhub_activity_id?: string | null;
          featured?: boolean;
          status?: ContentStatus;
          publish_at?: string | null;
          published_at?: string | null;
          expires_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          title?: string;
          summary?: string;
          body?: string;
          category?: string;
          location_name?: string | null;
          is_remote?: boolean;
          starts_at?: string;
          ends_at?: string | null;
          registration_deadline?: string | null;
          registration_url?: string;
          ymhub_activity_id?: string | null;
          featured?: boolean;
          status?: ContentStatus;
          publish_at?: string | null;
          published_at?: string | null;
          expires_at?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      news_posts: {
        Row: {
          id: string;
          slug: string;
          title: string;
          summary: string;
          body: string;
          featured: boolean;
          status: ContentStatus;
          publish_at: string | null;
          published_at: string | null;
          expires_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          summary: string;
          body: string;
          featured?: boolean;
          status?: ContentStatus;
          publish_at?: string | null;
          published_at?: string | null;
          expires_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          title?: string;
          summary?: string;
          body?: string;
          featured?: boolean;
          status?: ContentStatus;
          publish_at?: string | null;
          published_at?: string | null;
          expires_at?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      revisions: {
        Row: {
          id: number;
          content_kind: ContentKind;
          content_id: string;
          revision_number: number;
          operation: "insert" | "update";
          status: ContentStatus;
          snapshot: Json;
          actor_user_id: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      content_status: ContentStatus;
      content_kind: ContentKind;
    };
    CompositeTypes: Record<never, never>;
  };
};
