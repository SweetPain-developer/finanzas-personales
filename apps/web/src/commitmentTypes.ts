export type CommitmentType = "RECURRENTE" | "DEUDA" | "VARIABLE";
export type CommitmentStatus = "PENDIENTE" | "PAGADO";

export type CommitmentListItem = {
  id: string;
  templateId?: string | null;
  nombre: string;
  tipo: CommitmentType;
  monto: number;
  estado: CommitmentStatus;
  fechaVencimiento: string | null;
  dueDay: number | null;
  notas: string | null;
  canRevertPayment: boolean;
};

export type CommitmentGroup = {
  status: CommitmentStatus;
  label: string;
  commitments: CommitmentListItem[];
};

export type CommitmentsData = {
  currentMonth: string;
  currentMonthLabel: string;
  summary: {
    pendingCount: number;
    pendingTotal: number;
  };
  groups: CommitmentGroup[];
};

export type CommitmentTemplateListItem = {
  id: string;
  nombre: string;
  tipo: CommitmentType;
  montoDefault: number;
  diaVencimiento: number | null;
  activa: boolean;
  notas: string | null;
};

export type CommitmentTemplatesData = {
  templates: CommitmentTemplateListItem[];
};
