export type GoalStatus = "ACTIVA" | "PAUSADA" | "COMPLETADA";

export type GoalAccount = {
  id: string;
  nombre: string;
  saldo: number;
};

export type GoalEditorValues = {
  name: string;
  targetAmount: number;
  accountId: string;
  notes?: string | null;
};

export type GoalListItem = {
  id: string;
  nombre: string;
  montoObjetivo: number;
  estado: GoalStatus;
  notas: string | null;
  account: GoalAccount;
  progressPercent: number;
};

export type GoalGroup = {
  status: GoalStatus;
  label: string;
  goals: GoalListItem[];
};

export type GoalsData = {
  groups: GoalGroup[];
};
