import { AccountType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "../prisma.js";
import { getAccounts } from "./getAccounts.js";

vi.mock("../prisma.js", () => ({
  prisma: {
    account: { findMany: vi.fn() },
  },
}));

const findManyAccounts = prisma.account.findMany as Mock;

describe("getAccounts", () => {
  beforeEach(() => {
    findManyAccounts.mockReset();
  });

  it("groups active accounts by type and order", async () => {
    findManyAccounts.mockResolvedValueOnce([
      account({ id: "checking", nombre: "Cuenta Demo Principal", tipo: AccountType.OPERATIVA, saldo: 450_200, orden: 1 }),
      account({ id: "cash", nombre: "Efectivo", tipo: AccountType.OPERATIVA, saldo: 20_000, orden: 2 }),
      account({ id: "savings", nombre: "Billetera Demo", tipo: AccountType.AHORRO, saldo: 225_000, orden: 1 }),
      account({ id: "card-demo", nombre: "Tarjeta Demo", tipo: AccountType.DEUDA, saldo: -180_000, orden: 1 }),
    ]);

    const result = await getAccounts();

    expect(result.groups).toMatchObject([
      {
        type: "OPERATIVA",
        label: "Operativa",
        accounts: [
          { id: "checking", nombre: "Cuenta Demo Principal", tipo: "OPERATIVA", saldo: 450_200, activa: true, notas: null, hasHistory: false },
          { id: "cash", nombre: "Efectivo", tipo: "OPERATIVA", saldo: 20_000, activa: true, notas: null, hasHistory: false },
        ],
      },
      { type: "AHORRO", label: "Ahorro", accounts: [{ id: "savings", nombre: "Billetera Demo" }] },
      { type: "DEUDA", label: "Deuda", accounts: [{ id: "card-demo", nombre: "Tarjeta Demo" }] },
      { type: "RESERVA", label: "Reserva", accounts: [] },
    ]);
    expect(findManyAccounts).toHaveBeenCalledWith({
      select: { id: true, nombre: true, tipo: true, saldo: true, activa: true, notas: true, orden: true, _count: { select: { transacciones: true, metas: true } } },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }, { id: "asc" }],
    });
  });

  it("separates inactive accounts", async () => {
    findManyAccounts.mockResolvedValueOnce([
      account({ id: "active", nombre: "Cuenta Demo Principal", tipo: AccountType.OPERATIVA, activa: true, transacciones: 1 }),
      account({ id: "inactive", nombre: "Cuenta Demo Internacional", tipo: AccountType.DEUDA, activa: false, notas: "Cuenta antigua", metas: 1 }),
    ]);

    const result = await getAccounts();

    expect(result.groups[0]?.accounts).toEqual([{ id: "active", nombre: "Cuenta Demo Principal", tipo: "OPERATIVA", saldo: 0, activa: true, notas: null, hasHistory: true }]);
    expect(result.inactive).toEqual([{ id: "inactive", nombre: "Cuenta Demo Internacional", tipo: "DEUDA", saldo: 0, activa: false, notas: "Cuenta antigua", hasHistory: true }]);
  });
});

function account(
  overrides: Partial<{
    id: string;
    nombre: string;
    tipo: AccountType;
    saldo: number;
    activa: boolean;
    notas: string | null;
    orden: number;
    transacciones: number;
    metas: number;
  }>,
) {
  const { transacciones = 0, metas = 0, ...accountOverrides } = overrides;

  return {
    id: "account",
    nombre: "Cuenta",
    tipo: AccountType.OPERATIVA,
    saldo: 0,
    activa: true,
    notas: null,
    orden: 0,
    _count: { transacciones, metas },
    ...accountOverrides,
  };
}
