import { CategoryType } from "@prisma/client";

import { prisma } from "../prisma.js";

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

export async function getQuickEntryOptions(): Promise<QuickEntryOptions> {
  const [accounts, categories, lastTransaction] = await Promise.all([
    prisma.account.findMany({
      where: { activa: true },
      select: { id: true, nombre: true, tipo: true },
      orderBy: [{ orden: "asc" }, { id: "asc" }],
    }),
    prisma.category.findMany({
      where: { tipo: { in: [CategoryType.GASTO, CategoryType.INGRESO] } },
      select: { id: true, nombre: true, icono: true, tipo: true },
      orderBy: [{ tipo: "asc" }, { orden: "asc" }, { id: "asc" }],
    }),
    prisma.transaction.findFirst({
      where: { account: { activa: true } },
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
