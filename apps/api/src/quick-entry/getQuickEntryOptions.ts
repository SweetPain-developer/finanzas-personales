import { CategoryType } from "@prisma/client";

import { prisma } from "../prisma.js";

type QuickEntryAccountOption = QuickEntryOptions["accounts"][number];
type QuickEntryCategoryRecord = {
  id: string;
  nombre: string;
  icono: string;
  tipo: CategoryType;
};

const quickEntryReader = prisma as unknown as {
  account: {
    findMany(args: {
      where: { userId: string; activa: true };
      select: { id: true; nombre: true; tipo: true };
      orderBy: Array<Record<string, "asc" | "desc">>;
    }): Promise<QuickEntryAccountOption[]>;
  };
  category: {
    findMany(args: {
      where: { userId: string; tipo: { in: CategoryType[] } };
      select: { id: true; nombre: true; icono: true; tipo: true };
      orderBy: Array<Record<string, "asc" | "desc">>;
    }): Promise<QuickEntryCategoryRecord[]>;
  };
  transaction: {
    findFirst(args: {
      where: { userId: string; account: { userId: string; activa: true } };
      select: { accountId: true };
      orderBy: Array<Record<string, "asc" | "desc">>;
    }): Promise<{ accountId: string } | null>;
  };
};

export type QuickEntryOptions = {
  accounts: Array<{
    id: string;
    nombre: string;
    tipo: string;
  }>;
  categories: {
    GASTO: Array<{
      id: string;
      nombre: string;
      icono: string;
    }>;
    INGRESO: Array<{
      id: string;
      nombre: string;
      icono: string;
    }>;
  };
  lastUsedAccountId: string | null;
};

export async function getQuickEntryOptions(userId: string): Promise<QuickEntryOptions> {
  const [accounts, categories, lastTransaction] = await Promise.all([
    quickEntryReader.account.findMany({
      where: { userId, activa: true },
      select: { id: true, nombre: true, tipo: true },
      orderBy: [{ orden: "asc" }, { id: "asc" }],
    }),
    quickEntryReader.category.findMany({
      where: { userId, tipo: { in: [CategoryType.GASTO, CategoryType.INGRESO] } },
      select: { id: true, nombre: true, icono: true, tipo: true },
      orderBy: [{ tipo: "asc" }, { orden: "asc" }, { id: "asc" }],
    }),
    quickEntryReader.transaction.findFirst({
      where: { userId, account: { userId, activa: true } },
      select: { accountId: true },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  return {
    accounts,
    categories: {
      GASTO: categories
        .filter((category) => category.tipo === CategoryType.GASTO)
        .map(({ id, nombre, icono }) => ({ id, nombre, icono })),
      INGRESO: categories
        .filter((category) => category.tipo === CategoryType.INGRESO)
        .map(({ id, nombre, icono }) => ({ id, nombre, icono })),
    },
    lastUsedAccountId: lastTransaction?.accountId ?? (accounts.length > 0 ? accounts[0].id : null),
  };
}
