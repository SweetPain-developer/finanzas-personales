import { prisma } from "../prisma.js";

type AccountDeleteCandidate = {
  id: string;
  _count: { transacciones: number; metas: number };
};

const accountStore = prisma as unknown as {
  account: {
    findFirst(args: {
      where: { id: string; userId: string };
      select: { id: true; _count: { select: { transacciones: true; metas: true } } };
    }): Promise<AccountDeleteCandidate | null>;
    deleteMany(args: { where: { id: string; userId: string } }): Promise<{ count: number }>;
  };
  $transaction<T>(callback: (tx: typeof accountStore) => Promise<T>): Promise<T>;
};

export class AccountDeleteNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeleteNotFoundError";
  }
}

export class AccountDeleteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDeleteConflictError";
  }
}

export type AccountDeleteResult = { status: "deleted" };

export async function deleteAccount(id: string, userId: string): Promise<AccountDeleteResult> {
  try {
    return await accountStore.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id, userId },
        select: {
          id: true,
          _count: {
            select: {
              transacciones: true,
              metas: true,
            },
          },
        },
      });

      if (!account) {
        throw new AccountDeleteNotFoundError("Account not found.");
      }

      const hasHistory = account._count.transacciones > 0 || account._count.metas > 0;

      if (hasHistory) {
        throw new AccountDeleteConflictError("Account has financial history. Deactivate it instead of deleting it.");
      }

      const deleted = await tx.account.deleteMany({ where: { id, userId } });

      if (deleted.count === 0) {
        throw new AccountDeleteNotFoundError("Account not found.");
      }

      return { status: "deleted" };
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2003")) {
      throw new AccountDeleteConflictError("Account has financial history. Deactivate it instead of deleting it.");
    }

    if (hasPrismaCode(error, "P2025")) {
      throw new AccountDeleteNotFoundError("Account not found.");
    }

    throw error;
  }
}

function hasPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
