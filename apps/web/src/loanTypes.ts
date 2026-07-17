export type LoanStatus = "PENDIENTE" | "SALDADO" | "INCOBRABLE";

export type LoanAccount = { id: string; nombre: string; tipo: string; saldo?: number; activa?: boolean };

export type LoanRepayment = {
  id: string;
  monto: number;
  fecha: string;
  notas: string | null;
  cuentaDestino: LoanAccount;
};

export type Loan = {
  id: string;
  persona: string;
  montoEntregado: number;
  estado: LoanStatus;
  notas: string | null;
  fechaEntrega: string;
  cuentaEntrega: LoanAccount;
  saldoPendiente: number;
  devoluciones: LoanRepayment[];
};

export type LoansResponse = {
  loans: Loan[];
  summary: { pendingLoansTotal: number; pendingLoansCount: number };
};

export type AccountsResponse = {
  groups: Array<{ accounts: LoanAccount[] }>;
  inactive: LoanAccount[];
};
