export type Role = "admin" | "ambassador";

export type Level = "nivel0" | "plata" | "oro" | "diamante";

export type ProductVariant = "withAlcohol" | "withoutAlcohol";

export type SaleType =
  | "unit"
  | "promo"
  | "gift"
  | "singleNoAlcohol"
  | "giftNoAlcohol"
  | "wholesale";

export type User = {
  id: string;
  email: string;
  password: string;
  name: string;
  role: Role;
  ambassadorId?: string;
};

export type Ambassador = {
  id: string;
  name: string;
  code: string;
  level: Level;
  boostActive: boolean;
  boostExpiresAt?: string;
  active: boolean;
  notes: string;
};

export type BatchLineItem = {
  id: string;
  kind: "granizado" | "other";
  name: string;
  quantity?: number;
  unitPrice: number;
};

export type IngredientPurchase = {
  id: string;
  createdAt: string;
  name: string;
  supplier: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  notes: string;
};

export type ProductionBatch = {
  id: string;
  createdAt: string;
  label: string;
  variant: ProductVariant;
  unitsProduced: number;
  totalCost: number;
  items: BatchLineItem[];
  notes: string;
};

export type Sale = {
  id: string;
  createdAt: string;
  saleType: SaleType;
  quantity: number;
  priceTotal: number;
  ambassadorId?: string;
  ambassadorCode?: string;
  wholesaleVariant?: ProductVariant;
  wholesaleDiscountPct?: number;
  wholesaleDiscountValue?: number;
  wholesaleNetTotal?: number;
  wholesaleBaseCommissionPct?: number;
  wholesaleBoostBonusPct?: number;
  commissionRate?: number;
  commissionValue?: number;
  discountExpenseId?: string;
  commissionExpenseId?: string;
  note: string;
};

export type ExpenseType = "monthly" | "oneTime" | "commission" | "discount";

export type Expense = {
  id: string;
  createdAt: string;
  category: string;
  description: string;
  amount: number;
  type: ExpenseType;
  sourceSaleId?: string;
  ambassadorId?: string;
  ambassadorCode?: string;
};

export type AppState = {
  users: User[];
  ambassadors: Ambassador[];
  ingredientPurchases: IngredientPurchase[];
  batches: ProductionBatch[];
  sales: Sale[];
  expenses: Expense[];
  settings: PricingSettings;
};

export type PricingSettings = {
  unitWithAlcoholPrice: number;
  unitNoAlcoholPrice: number;
  promoPackagePrice: number;
  giftWithAlcoholPrice: number;
  giftNoAlcoholPrice: number;
  boostBonusPct: number;
  wholesaleWithAlcoholTiers: WholesaleTier[];
  wholesaleNoAlcoholTiers: WholesaleTier[];
};

export type WholesaleTier = {
  minQuantity: number;
  unitPrice: number;
  commissionPct: number;
  clientDiscountPct: number;
};

export type BatchRemaining = {
  id: string;
  label: string;
  variant: ProductVariant;
  unitsRemaining: number;
  unitsProduced: number;
  totalCost: number;
  unitCost: number;
};

export type SaleLedger = Sale & {
  ambassadorName?: string;
  ambassadorLevel?: Level;
  commissionRate: number;
  commissionValue: number;
  clientSavings: number;
  costOfGoods: number;
  grossProfit: number;
  margin: number;
  resolvedVariant: ProductVariant;
  displayLabel: string;
};

export type CalculatedState = {
  batches: BatchRemaining[];
  sales: SaleLedger[];
  totals: {
    investment: number;
    revenue: number;
    costOfGoods: number;
    grossProfit: number;
    commissions: number;
    discounts: number;
    expenses: number;
    netProfit: number;
    unitsSold: number;
    unitsProduced: number;
    unitsRemaining: number;
  };
};
