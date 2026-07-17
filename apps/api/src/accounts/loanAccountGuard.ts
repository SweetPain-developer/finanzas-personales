import { prisma } from "../prisma.js";

const ALLOWED_LOAN_ACCOUNT_TYPES = ["OPERATIVA", "AHORRO", "RESERVA"] as const;

type LoanAccountGuardClient = {
  transaction: {
    findFirst(args: { where: Record<string, unknown>; select: { id: true } }): Promise<{ id: string } | null>;
  };
};

export class LoanAccountConflictError extends Error {
  constructor(message = "Account has loan history and cannot be made inactive or changed in type.") {
    super(message);
    this.name = "LoanAccountConflictError";
  }
}

export async function hasLoanHistory(id: string, userId: string, client = prisma as unknown as LoanAccountGuardClient) {
  return Boolean(await client.transaction.findFirst({
    where: {
      accountId: id,
      userId,
      OR: [
        { loanDelivery: { isNot: null } },
        { loanRepayment: { isNot: null } },
      ],
    },
    select: { id: true },
  }));
}

export function isAllowedLoanAccountType(type: string) {
  return (ALLOWED_LOAN_ACCOUNT_TYPES as readonly string[]).includes(type);
}
