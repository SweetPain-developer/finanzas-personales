import type { Account, Category, Goal, Transaction } from "@finanzas-personales/shared-types";

export type DashboardGoal = Pick<
  Goal,
  "id" | "nombre" | "montoObjetivo" | "estado" | "accountId"
> & {
  emoji: string;
  account: Pick<Account, "id" | "nombre" | "saldo">;
};

export type DashboardTransaction = Omit<
  Pick<
  Transaction,
  "id" | "tipo" | "monto" | "descripcion" | "accountId" | "categoryId" | "transferId"
  >,
  "tipo"
> & {
  tipo: "GASTO" | "INGRESO" | "TRANSFERENCIA";
  fecha: string;
  displayDate: string;
  account: Pick<Account, "id" | "nombre">;
  category: Pick<Category, "id" | "nombre" | "icono"> | null;
};

export type DashboardData = {
  currentMonthLabel: string;
  availableToSpend: number;
  liquidNetWorth: number;
  liquidNetWorthVariation: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  goals: DashboardGoal[];
  recentTransactions: DashboardTransaction[];
};
