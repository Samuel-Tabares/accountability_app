export type Role = "admin" | "ambassador";

export type Level = "nivel0" | "plata" | "oro" | "diamante";

export type ProductVariant = "withAlcohol" | "withoutAlcohol";

export type SaleType =
  | "unit"
  | "promo"
  | "gift"
  | "singleNoAlcohol"
  | "giftNoAlcohol"
  | "wholesale"
  | "consignment";

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
  costOfGoods?: number;
  grossProfit?: number;
  netProfit?: number;
  margin?: number;
  pricingVersionId?: string;
  discountExpenseId?: string;
  commissionExpenseId?: string;
  consignmentClientId?: string;
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

export type ConsignmentClient = {
  id: string;
  createdAt: string;
  name: string;
  address: string;
  contactName?: string;
  phone?: string;
  notes?: string;
  baseQuantityWithAlcohol: number;
  baseQuantityWithoutAlcohol: number;
  priceWithAlcohol?: number;
  priceWithoutAlcohol?: number;
  nextReplenishmentDate: string;
  initialSaleIdWithAlcohol?: string;
  initialSaleIdWithoutAlcohol?: string;
};

export type ConsignmentReplenishment = {
  id: string;
  createdAt: string;
  clientId: string;
  unitsDeliveredWithAlcohol: number;
  unitsDeliveredWithoutAlcohol: number;
  unitPriceWithAlcohol: number;
  unitPriceWithoutAlcohol: number;
  amountCharged: number;
  newBaseWithAlcohol: number;
  newBaseWithoutAlcohol: number;
  notes?: string;
  saleIdWithAlcohol?: string;
  saleIdWithoutAlcohol?: string;
};

export type ConsignmentPickup = {
  id: string;
  createdAt: string;
  clientId: string;
  unitsCollectedWithAlcohol: number;
  unitsCollectedWithoutAlcohol: number;
  unitsChargedWithAlcohol: number;
  unitsChargedWithoutAlcohol: number;
  unitPriceWithAlcohol: number;
  unitPriceWithoutAlcohol: number;
  amountCharged: number;
  saleIdWithAlcohol?: string;
  saleIdWithoutAlcohol?: string;
  notes?: string;
};

export type InventoryReturn = {
  id: string;
  createdAt: string;
  batchId: string;
  variant: ProductVariant;
  units: number;
  sourcePickupId?: string;
  sourceClientId?: string;
  notes?: string;
};

export type AppState = {
  users: User[];
  ambassadors: Ambassador[];
  ingredientPurchases: IngredientPurchase[];
  batches: ProductionBatch[];
  sales: Sale[];
  expenses: Expense[];
  settings: PricingSettings;
  consignmentClients: ConsignmentClient[];
  consignmentReplenishments: ConsignmentReplenishment[];
  consignmentPickups: ConsignmentPickup[];
  inventoryReturns: InventoryReturn[];
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
  netProfit: number;
  margin: number;
  resolvedVariant: ProductVariant;
  displayLabel: string;
};

export type CalculatedState = {
  batches: BatchRemaining[];
  sales: SaleLedger[];
  totals: {
    investment: number;
    baseSales: number;
    revenue: number;
    costOfGoods: number;
    grossProfit: number;
    commissions: number;
    discounts: number;
    manualExpenses: number;
    expenses: number;
    netProfit: number;
    unitsSold: number;
    unitsProduced: number;
    unitsRemaining: number;
    consignedWithAlcohol: number;
    consignedWithoutAlcohol: number;
  };
};
