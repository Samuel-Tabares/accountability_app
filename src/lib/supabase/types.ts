export type AppRole = "admin" | "embajador";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: AppRole;
          ambassador_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          full_name?: string | null;
          role?: AppRole;
          ambassador_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: AppRole;
          ambassador_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          created_at: string;
          created_by: string;
          ambassador_profile_id: string | null;
          amount: number;
          quantity: number;
          note: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          created_by?: string;
          ambassador_profile_id?: string | null;
          amount: number;
          quantity: number;
          note?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          created_by?: string;
          ambassador_profile_id?: string | null;
          amount?: number;
          quantity?: number;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_ambassador_profile_id_fkey";
            columns: ["ambassador_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      expenses: {
        Row: {
          id: string;
          created_at: string;
          created_by: string;
          ambassador_profile_id: string | null;
          category: string;
          description: string;
          amount: number;
          expense_type: "monthly" | "oneTime" | "commission" | "discount";
        };
        Insert: {
          id?: string;
          created_at?: string;
          created_by?: string;
          ambassador_profile_id?: string | null;
          category: string;
          description: string;
          amount: number;
          expense_type: "monthly" | "oneTime" | "commission" | "discount";
        };
        Update: {
          id?: string;
          created_at?: string;
          created_by?: string;
          ambassador_profile_id?: string | null;
          category?: string;
          description?: string;
          amount?: number;
          expense_type?: "monthly" | "oneTime" | "commission" | "discount";
        };
        Relationships: [
          {
            foreignKeyName: "expenses_ambassador_profile_id_fkey";
            columns: ["ambassador_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type SaleRow = Database["public"]["Tables"]["sales"]["Row"];
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
