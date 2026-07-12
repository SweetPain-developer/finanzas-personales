export type MovementAccount = {
  id: string;
  nombre: string;
};

export type MovementCategory = {
  id: string;
  nombre: string;
  icono: string;
  tipo: "GASTO" | "INGRESO";
};

export type NormalMovement = {
  id: string;
  tipo: "GASTO" | "INGRESO";
  monto: number;
  descripcion: string;
  account: MovementAccount;
  category: MovementCategory | null;
  fecha: string;
};

export type TransferMovement = {
  id: string;
  transferId: string;
  tipo: "TRANSFERENCIA";
  monto: number;
  descripcion: string;
  fromAccount: MovementAccount;
  toAccount: MovementAccount;
  fecha: string;
};

export type Movement = NormalMovement | TransferMovement;

export type MovementGroup = {
  label: string;
  date: string;
  movements: Movement[];
};

export type MovementsData = {
  currentMonth: string;
  filters: {
    accounts: MovementAccount[];
    categories: MovementCategory[];
  };
  groups: MovementGroup[];
};
