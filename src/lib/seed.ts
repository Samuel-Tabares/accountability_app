import type { AppState } from "./types";

export const blankState: AppState = {
  users: [],
  ambassadors: [],
  ingredientPurchases: [],
  batches: [],
  sales: [],
  expenses: [],
  settings: {
    unitWithAlcoholPrice: 8000,
    unitNoAlcoholPrice: 7000,
    promoPackagePrice: 12000,
    giftWithAlcoholPrice: 0,
    giftNoAlcoholPrice: 0,
    boostBonusPct: 0.05,
    wholesaleWithAlcoholTiers: [
      { minQuantity: 20, unitPrice: 4900, commissionPct: 0.15, clientDiscountPct: 0.1 },
      { minQuantity: 50, unitPrice: 4700, commissionPct: 0.18, clientDiscountPct: 0.12 },
      { minQuantity: 100, unitPrice: 4500, commissionPct: 0.2, clientDiscountPct: 0.15 }
    ],
    wholesaleNoAlcoholTiers: [
      { minQuantity: 20, unitPrice: 4800, commissionPct: 0.15, clientDiscountPct: 0.1 },
      { minQuantity: 50, unitPrice: 4500, commissionPct: 0.18, clientDiscountPct: 0.12 },
      { minQuantity: 100, unitPrice: 4200, commissionPct: 0.2, clientDiscountPct: 0.15 }
    ]
  },
  consignmentClients: [],
  consignmentReplenishments: [],
  consignmentPickups: [],
  inventoryReturns: [],
  saleBatchConsumptions: [],
  consignmentStockCogs: 0
};
