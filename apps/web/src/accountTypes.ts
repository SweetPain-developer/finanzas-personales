export type AccountType = "OPERATIVA" | "AHORRO" | "DEUDA" | "RESERVA";

export type AccountListItem = {
  id: string;
  nombre: string;
  tipo: AccountType;
  saldo: number;
  activa: boolean;
  notas: string | null;
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
