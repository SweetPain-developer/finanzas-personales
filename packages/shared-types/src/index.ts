
import { z } from 'zod';

export const CreateAccountDTO = z.object({
  name: z.string().min(1, { message: "El nombre no puede estar vacío" }),
  type: z.enum(["OPERATIVA", "AHORRO", "DEUDA", "RESERVA"]),
  balance: z.number().int(),
});

export type CreateAccountDTO = z.infer<typeof CreateAccountDTO>;

export const UpdateAccountDTO = CreateAccountDTO;

export type UpdateAccountDTO = z.infer<typeof UpdateAccountDTO>;

export const GoalMutationDTO = z.object({
  name: z.string().trim().min(1, { message: "El nombre no puede estar vacío" }),
  targetAmount: z.number().int().positive({ message: "El monto objetivo debe ser mayor a cero" }),
  accountId: z.string().trim().min(1, { message: "La cuenta asociada es obligatoria" }),
  notes: z.string().trim().optional().nullable(),
});

export type GoalMutationDTO = z.infer<typeof GoalMutationDTO>;

export const GoalStatusUpdateDTO = z.object({
  status: z.enum(["ACTIVA", "PAUSADA", "COMPLETADA"]),
});

export type GoalStatusUpdateDTO = z.infer<typeof GoalStatusUpdateDTO>;

export type {

  Account,
  Transaction,
  Commitment,
  CommitmentTemplate,
  Goal,
  Category,
  AccountType,
  TransactionType,
  CommitmentType,
  CommitmentStatus,
  GoalStatus,
  CategoryType,
} from "@prisma/client";
