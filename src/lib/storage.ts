import type { AppState } from "./types";
import { blankState } from "./seed";
import {
  isBoostActive,
  resolveAmbassador,
  resolveWholesaleDiscountAmount,
  resolveWholesaleNetTotal,
  resolveWholesaleSelection
} from "./ledger";

function normalizeState(state: AppState): AppState {
  const sales = state.sales.map((sale) => {
    if (sale.saleType !== "wholesale") {
      return sale;
    }

    const ambassador = resolveAmbassador(state.ambassadors, sale);
    const hasWholesaleAmbassador = Boolean(sale.ambassadorId || sale.ambassadorCode);
    const selection = resolveWholesaleSelection(
      state.settings,
      sale.wholesaleVariant ?? "withAlcohol",
      sale.quantity
    );
    const wholesaleDiscountPct = hasWholesaleAmbassador ? sale.wholesaleDiscountPct ?? selection.discountPct : 0;
    const wholesaleDiscountValue =
      hasWholesaleAmbassador
        ? sale.wholesaleDiscountValue ?? resolveWholesaleDiscountAmount(sale.priceTotal, wholesaleDiscountPct)
        : 0;
    const wholesaleNetTotal =
      hasWholesaleAmbassador
        ? sale.wholesaleNetTotal ?? resolveWholesaleNetTotal(sale.priceTotal, wholesaleDiscountPct)
        : sale.priceTotal;
    const wholesaleBaseCommissionPct = sale.wholesaleBaseCommissionPct ?? selection.commissionRate;
    const wholesaleBoostBonusPct =
      sale.wholesaleBoostBonusPct ??
      (hasWholesaleAmbassador && ambassador && isBoostActive(ambassador, new Date(sale.createdAt))
        ? state.settings.boostBonusPct
        : 0);
    const commissionRate = sale.commissionRate ?? wholesaleBaseCommissionPct + wholesaleBoostBonusPct;
    const commissionValue =
      hasWholesaleAmbassador && ambassador
        ? wholesaleNetTotal * commissionRate
        : hasWholesaleAmbassador
          ? sale.commissionValue ?? 0
          : 0;
    const discountExpense = state.expenses.find(
      (expense) => expense.type === "discount" && expense.sourceSaleId === sale.id
    );
    const commissionExpense = state.expenses.find(
      (expense) => expense.type === "commission" && expense.sourceSaleId === sale.id
    );

    return {
      ...sale,
      wholesaleDiscountPct,
      wholesaleDiscountValue,
      wholesaleNetTotal,
      wholesaleBaseCommissionPct,
      wholesaleBoostBonusPct,
      commissionRate,
      commissionValue,
      discountExpenseId: discountExpense?.id ?? sale.discountExpenseId,
      commissionExpenseId: commissionExpense?.id ?? sale.commissionExpenseId
    };
  });

  const expenses = state.expenses.map((expense) => {
    if (expense.type !== "commission" && expense.type !== "discount") {
      return expense;
    }

    if (expense.sourceSaleId) {
      return expense;
    }

    const linkedSale = sales.find((sale) => {
      if (expense.type === "commission") {
        return sale.commissionExpenseId === expense.id;
      }

      return sale.discountExpenseId === expense.id;
    });
    if (!linkedSale) {
      return expense;
    }

    if (!(linkedSale.ambassadorId || linkedSale.ambassadorCode)) {
      return null;
    }

    const normalizedAmount: number =
      expense.type === "commission"
        ? linkedSale.commissionValue ?? expense.amount
        : linkedSale.wholesaleDiscountValue ?? expense.amount;

    return {
      ...expense,
      sourceSaleId: linkedSale.id,
      amount: normalizedAmount,
      ambassadorId: linkedSale.ambassadorId ?? expense.ambassadorId,
      ambassadorCode: linkedSale.ambassadorCode ?? expense.ambassadorCode
    };
  }).filter((expense): expense is AppState["expenses"][number] => Boolean(expense));

  return {
    ...state,
    sales,
    expenses
  };
}

const STORAGE_KEY = "trabix-accountability-state-v4";

export function loadState(): AppState {
  if (typeof window === "undefined") {
    return blankState;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return blankState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const state: AppState = {
      ...blankState,
      ...parsed,
      settings: {
        ...blankState.settings,
        ...(parsed.settings ?? {})
      },
      users: parsed.users ?? blankState.users,
      ambassadors: parsed.ambassadors ?? blankState.ambassadors,
      ingredientPurchases: parsed.ingredientPurchases ?? blankState.ingredientPurchases,
      batches: parsed.batches ?? blankState.batches,
      sales: parsed.sales ?? blankState.sales,
      expenses: parsed.expenses ?? blankState.expenses
    };

    return normalizeState(state);
  } catch {
    return blankState;
  }
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}
