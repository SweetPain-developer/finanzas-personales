import { AccountType, type Account } from "@prisma/client";

import { prisma } from "../prisma.js";

export type AccountListItem = Pick<Account, "id" | "nombre" | "tipo" | "saldo" | "activa" | "notas"> & {
  hasHistory: boolean;
};

export type AccountGroup = {
  type: AccountType;
  label: string;
  accounts: AccountListItem[];
};

export type AccountsData = {
  groups: AccountGroup[];
  inactive: AccountListItem[];
};

const ACCOUNT_TYPE_ORDER = [AccountType.OPERATIVA, AccountType.AHORRO, AccountType.DEUDA, AccountType.RESERVA] as const;

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.OPERATIVA]: "Operativa",
  [AccountType.AHORRO]: "Ahorro",
  [AccountType.DEUDA]: "Deuda",
  [AccountType.RESERVA]: "Reserva",
};

export async function getAccounts(): Promise<AccountsData> {
  const accounts = await prisma.account.findMany({
    select: {
      id: true,
      nombre: true,
      tipo: true,
      saldo: true,
      activa: true,
      notas: true,
      orden: true,
      _count: { select: { transacciones: true, metas: true } },
    },
    orderBy: [{ orden: "asc" }, { nombre: "asc" }, { id: "asc" }],
  });

  const activeAccounts = accounts.filter((account) => account.activa);
  const inactive = accounts.filter((account) => !account.activa).map(toAccountListItem);

  return {
    groups: ACCOUNT_TYPE_ORDER.map((type) => ({
      type,
      label: ACCOUNT_TYPE_LABELS[type],
      accounts: activeAccounts.filter((account) => account.tipo === type).map(toAccountListItem),
    })),
    inactive,
  };
}

function toAccountListItem(account: Omit<AccountListItem, "hasHistory"> & Pick<Account, "orden"> & { _count: { transacciones: number; metas: number } }): AccountListItem {
  return {
    id: account.id,
    nombre: account.nombre,
    tipo: account.tipo,
    saldo: account.saldo,
    activa: account.activa,
    notas: account.notas,
    hasHistory: account._count.transacciones > 0 || account._count.metas > 0,
  };
}
