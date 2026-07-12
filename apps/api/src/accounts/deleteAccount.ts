import { prisma } from "../prisma.js";

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

export async function deleteAccount(id: string): Promise<AccountDeleteResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({
        where: { id },
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

      await tx.account.delete({ where: { id } });

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
