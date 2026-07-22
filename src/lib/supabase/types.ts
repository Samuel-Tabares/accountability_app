export type AppRole = "admin" | "embajador";
export type Level = "nivel0" | "plata" | "oro" | "diamante";
export type ProductVariant = "withAlcohol" | "withoutAlcohol";
export type SaleType = "unit" | "promo" | "gift" | "singleNoAlcohol" | "giftNoAlcohol" | "wholesale" | "consignment";
export type ExpenseType = "monthly" | "oneTime" | "commission" | "discount";

export type ConsignmentClientRow = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  name: string;
  address: string;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  base_quantity_with_alcohol: number;
  base_quantity_without_alcohol: number;
  price_with_alcohol: number | null;
  price_without_alcohol: number | null;
  next_replenishment_date: string;
  initial_sale_id_with_alcohol: string | null;
  initial_sale_id_without_alcohol: string | null;
};

export type ConsignmentReplenishmentRow = {
  id: string;
  created_at: string;
  created_by: string;
  client_id: string;
  units_delivered_with_alcohol: number;
  units_delivered_without_alcohol: number;
  unit_price_with_alcohol: number;
  unit_price_without_alcohol: number;
  amount_charged: number;
  new_base_with_alcohol: number;
  new_base_without_alcohol: number;
  previous_base_with_alcohol: number | null;
  previous_base_without_alcohol: number | null;
  notes: string | null;
  sale_id_with_alcohol: string | null;
  sale_id_without_alcohol: string | null;
};

export type ConsignmentPickupRow = {
  id: string;
  created_at: string;
  created_by: string;
  client_id: string;
  units_collected_with_alcohol: number;
  units_collected_without_alcohol: number;
  units_charged_with_alcohol: number;
  units_charged_without_alcohol: number;
  unit_price_with_alcohol: number;
  unit_price_without_alcohol: number;
  amount_charged: number;
  sale_id_with_alcohol: string | null;
  sale_id_without_alcohol: string | null;
  notes: string | null;
};

export type InventoryReturnRow = {
  id: string;
  created_at: string;
  created_by: string;
  batch_id: string;
  variant: ProductVariant;
  units: number;
  source_pickup_id: string | null;
  source_client_id: string | null;
  notes: string | null;
};

export type ConsignmentReactivationRow = {
  id: string;
  created_at: string;
  created_by: string;
  client_id: string;
  units_with_alcohol: number;
  units_without_alcohol: number;
  unit_price_with_alcohol: number;
  unit_price_without_alcohol: number;
  sale_id_with_alcohol: string | null;
  sale_id_without_alcohol: string | null;
  notes: string | null;
};

export type CompanyInfoRow = {
  id: "singleton";
  legal_name: string;
  nit: string;
  address: string;
  phone: string;
  tax_status: string;
  sanitary_registry: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          username: string;
          full_name: string | null;
          phone: string | null;
          role: AppRole;
          ambassador_id: string | null;
          level: Level;
          must_change_password: boolean;
          password_updated_at: string | null;
          password_reset_at: string | null;
          is_active: boolean;
          boost_active: boolean;
          boost_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          email: string;
          username: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
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
          sale_type: SaleType;
          wholesale_variant: ProductVariant | null;
          pricing_version_id: string | null;
          price_total: number | null;
          wholesale_discount_pct: number;
          wholesale_discount_value: number;
          wholesale_net_total: number | null;
          wholesale_base_commission_pct: number;
          wholesale_boost_bonus_pct: number;
          commission_rate: number;
          commission_value: number;
          cost_of_goods: number;
          gross_profit: number | null;
          net_profit: number | null;
          margin: number;
          consignment_client_id: string | null;
          client_name: string | null;
          client_address: string | null;
          client_phone: string | null;
          delivery_fee: number;
        };
        Insert: Partial<Database["public"]["Tables"]["sales"]["Row"]> & {
          created_by: string;
          amount: number;
          quantity: number;
        };
        Update: Partial<Database["public"]["Tables"]["sales"]["Row"]>;
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
          expense_type: ExpenseType;
          source_sale_id: string | null;
          batch_id: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["expenses"]["Row"]> & {
          created_by: string;
          category: string;
          description: string;
          amount: number;
          expense_type: ExpenseType;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "expenses_ambassador_profile_id_fkey";
            columns: ["ambassador_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_source_sale_id_fkey";
            columns: ["source_sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          }
        ];
      };
      pricing_versions: {
        Row: {
          id: string;
          created_at: string;
          created_by: string | null;
          is_active: boolean;
          unit_with_alcohol_price: number;
          unit_no_alcohol_price: number;
          promo_package_price: number;
          gift_with_alcohol_price: number;
          gift_no_alcohol_price: number;
          boost_bonus_pct: number;
        };
        Insert: Partial<Database["public"]["Tables"]["pricing_versions"]["Row"]> & {
          unit_with_alcohol_price: number;
          unit_no_alcohol_price: number;
          promo_package_price: number;
        };
        Update: Partial<Database["public"]["Tables"]["pricing_versions"]["Row"]>;
        Relationships: [];
      };
      pricing_wholesale_tiers: {
        Row: {
          id: string;
          pricing_version_id: string;
          variant: ProductVariant;
          min_quantity: number;
          unit_price: number;
          commission_pct: number;
          client_discount_pct: number;
        };
        Insert: Partial<Database["public"]["Tables"]["pricing_wholesale_tiers"]["Row"]> & {
          pricing_version_id: string;
          variant: ProductVariant;
          min_quantity: number;
          unit_price: number;
        };
        Update: Partial<Database["public"]["Tables"]["pricing_wholesale_tiers"]["Row"]>;
        Relationships: [];
      };
      production_batches: {
        Row: {
          id: string;
          created_at: string;
          created_by: string | null;
          label: string;
          variant: ProductVariant;
          units_produced: number;
          total_cost: number;
          notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["production_batches"]["Row"]> & {
          label: string;
          variant: ProductVariant;
          units_produced: number;
          total_cost: number;
        };
        Update: Partial<Database["public"]["Tables"]["production_batches"]["Row"]>;
        Relationships: [];
      };
      production_batch_items: {
        Row: {
          id: string;
          batch_id: string;
          kind: "granizado" | "other";
          name: string;
          quantity: number | null;
          unit_price: number;
        };
        Insert: Partial<Database["public"]["Tables"]["production_batch_items"]["Row"]> & {
          batch_id: string;
          kind: "granizado" | "other";
          name: string;
          unit_price: number;
        };
        Update: Partial<Database["public"]["Tables"]["production_batch_items"]["Row"]>;
        Relationships: [];
      };
      sale_batch_consumptions: {
        Row: {
          id: string;
          sale_id: string;
          batch_id: string | null;
          units: number;
          cost: number;
          consumes_stock: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["sale_batch_consumptions"]["Row"]> & {
          sale_id: string;
          units: number;
          cost: number;
        };
        Update: Partial<Database["public"]["Tables"]["sale_batch_consumptions"]["Row"]>;
        Relationships: [];
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
export type PricingVersionRow = Database["public"]["Tables"]["pricing_versions"]["Row"];
export type PricingWholesaleTierRow = Database["public"]["Tables"]["pricing_wholesale_tiers"]["Row"];
export type ProductionBatchRow = Database["public"]["Tables"]["production_batches"]["Row"];
export type ProductionBatchItemRow = Database["public"]["Tables"]["production_batch_items"]["Row"];
export type SaleBatchConsumptionRow = Database["public"]["Tables"]["sale_batch_consumptions"]["Row"];
