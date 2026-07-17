import type { Account } from "@prisma/client";
import { prisma } from "../prisma.js";
import { hasLoanHistory, isAllowedLoanAccountType, LoanAccountConflictError } from "./loanAccountGuard.js";

const accountWriter = prisma as unknown as {
  account: {
    findFirst(args: { where: { id: string; userId: string }; select?: { tipo: true } }): Promise<{ tipo: string } | null>;
    updateMany(args: { where: { id: string; userId: string }; data: { activa: boolean } }): Promise<{ count: number }>;
    findFirstOrThrow(args: { where: { id: string; userId: string } }): Promise<Account>;
  };
};

export class AccountReactivateNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountReactivateNotFoundError";
  }
}

export { LoanAccountConflictError };

export async function reactivateAccount(id: string, userId: string) {
  const account = await accountWriter.account.findFirst({ where: { id, userId }, select: { tipo: true } });
  if (account && await hasLoanHistory(id, userId) && !isAllowedLoanAccountType(account.tipo)) {
    throw new LoanAccountConflictError("Loan-linked accounts must remain OPERATIVA, AHORRO, or RESERVA.");
  }

  const updatedAccount = await accountWriter.account.updateMany({
    where: { id, userId },
    data: { activa: true },
  });

  if (updatedAccount.count === 0) {
    throw new AccountReactivateNotFoundError("Account not found.");
  }

  return accountWriter.account.findFirstOrThrow({ where: { id, userId } });
}
