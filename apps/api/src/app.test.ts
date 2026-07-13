import request from "supertest";
import { AccountType, CommitmentStatus, CommitmentType, GoalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "./app.js";
import { createSessionToken } from "./auth/session.js";
import { createAccount } from "./accounts/createAccount.js";
import { AccountDeleteConflictError, AccountDeleteNotFoundError, deleteAccount } from "./accounts/deleteAccount.js";
import { getAccounts } from "./accounts/getAccounts.js";
import { AccountReactivateNotFoundError, reactivateAccount } from "./accounts/reactivateAccount.js";
import { AccountDeactivateNotFoundError, deactivateAccount } from "./accounts/deactivateAccount.js";
import { AccountUpdateNotFoundError, updateAccount } from "./accounts/updateAccount.js";
import { CommitmentValidationError, getCommitments } from "./commitments/getCommitments.js";
import { CommitmentCreateValidationError, createCommitment } from "./commitments/createCommitment.js";
import { CommitmentDeleteConflictError, CommitmentDeleteNotFoundError, deleteCommitment } from "./commitments/deleteCommitment.js";
import { CommitmentNotFoundError, CommitmentPaymentConflictError, CommitmentPaymentValidationError, markCommitmentPaid, markCommitmentUnpaid } from "./commitments/markCommitmentPaid.js";
import { CommitmentUpdateConflictError, CommitmentUpdateNotFoundError, CommitmentUpdateValidationError, updateCommitment } from "./commitments/updateCommitment.js";
import { CommitmentTemplateDeleteConflictError, CommitmentTemplateNotFoundError, CommitmentTemplateValidationError, createCommitmentTemplate, deleteCommitmentTemplate, getCommitmentTemplates, updateCommitmentTemplate, updateCommitmentTemplateActive } from "./commitment-templates/commitmentTemplates.js";
import { getDashboardData } from "./dashboard/getDashboardData.js";
import { createGoal, GoalValidationError } from "./goals/createGoal.js";
import { deleteGoal, GoalDeleteNotFoundError } from "./goals/deleteGoal.js";
import { getGoals } from "./goals/getGoals.js";
import { GoalNotFoundError, updateGoal } from "./goals/updateGoal.js";
import { GoalStatusNotFoundError, updateGoalStatus } from "./goals/updateGoalStatus.js";
import { deleteMovement, MovementDeleteConflictError, MovementDeleteNotFoundError } from "./movements/deleteMovement.js";
import { getMovements, MovementValidationError } from "./movements/getMovements.js";
import { MovementUpdateConflictError, MovementUpdateNotFoundError, MovementUpdateValidationError, updateMovement } from "./movements/updateMovement.js";
import { getQuickEntryOptions } from "./quick-entry/getQuickEntryOptions.js";
import { createTransaction, TransactionValidationError } from "./transactions/createTransaction.js";

vi.mock("./dashboard/getDashboardData.js", () => ({
  getDashboardData: vi.fn(),
}));

vi.mock("./accounts/getAccounts.js", () => ({
  getAccounts: vi.fn(),
}));

vi.mock("./accounts/createAccount.js", () => ({
  createAccount: vi.fn(),
}));

vi.mock("./accounts/deleteAccount.js", () => ({
  AccountDeleteConflictError: class AccountDeleteConflictError extends Error {},
  AccountDeleteNotFoundError: class AccountDeleteNotFoundError extends Error {},
  deleteAccount: vi.fn(),
}));

vi.mock("./accounts/deactivateAccount.js", () => ({
  AccountDeactivateNotFoundError: class AccountDeactivateNotFoundError extends Error {},
  deactivateAccount: vi.fn(),
}));

vi.mock("./accounts/updateAccount.js", () => ({
  AccountUpdateNotFoundError: class AccountUpdateNotFoundError extends Error {},
  updateAccount: vi.fn(),
}));

vi.mock("./accounts/reactivateAccount.js", () => ({
  AccountReactivateNotFoundError: class AccountReactivateNotFoundError extends Error {},
  reactivateAccount: vi.fn(),
}));

vi.mock("./quick-entry/getQuickEntryOptions.js", () => ({
  getQuickEntryOptions: vi.fn(),
}));

vi.mock("./goals/getGoals.js", () => ({
  getGoals: vi.fn(),
}));

vi.mock("./goals/createGoal.js", () => ({
  GoalValidationError: class GoalValidationError extends Error {},
  createGoal: vi.fn(),
}));

vi.mock("./goals/updateGoal.js", () => ({
  GoalNotFoundError: class GoalNotFoundError extends Error {},
  updateGoal: vi.fn(),
}));

vi.mock("./goals/updateGoalStatus.js", () => ({
  GoalStatusNotFoundError: class GoalStatusNotFoundError extends Error {},
  updateGoalStatus: vi.fn(),
}));

vi.mock("./goals/deleteGoal.js", () => ({
  GoalDeleteNotFoundError: class GoalDeleteNotFoundError extends Error {},
  deleteGoal: vi.fn(),
}));

vi.mock("./commitments/getCommitments.js", () => ({
  CommitmentValidationError: class CommitmentValidationError extends Error {},
  getCommitments: vi.fn(),
}));

vi.mock("./commitments/createCommitment.js", () => ({
  CommitmentCreateValidationError: class CommitmentCreateValidationError extends Error {},
  createCommitment: vi.fn(),
}));

vi.mock("./commitments/deleteCommitment.js", () => ({
  CommitmentDeleteNotFoundError: class CommitmentDeleteNotFoundError extends Error {},
  CommitmentDeleteConflictError: class CommitmentDeleteConflictError extends Error {},
  deleteCommitment: vi.fn(),
}));

vi.mock("./commitments/markCommitmentPaid.js", () => ({
  CommitmentNotFoundError: class CommitmentNotFoundError extends Error {},
  CommitmentPaymentConflictError: class CommitmentPaymentConflictError extends Error {},
  CommitmentPaymentValidationError: class CommitmentPaymentValidationError extends Error {},
  markCommitmentPaid: vi.fn(),
  markCommitmentUnpaid: vi.fn(),
}));

vi.mock("./commitments/updateCommitment.js", () => ({
  CommitmentUpdateNotFoundError: class CommitmentUpdateNotFoundError extends Error {},
  CommitmentUpdateValidationError: class CommitmentUpdateValidationError extends Error {},
  CommitmentUpdateConflictError: class CommitmentUpdateConflictError extends Error {},
  updateCommitment: vi.fn(),
}));

vi.mock("./commitment-templates/commitmentTemplates.js", () => ({
  CommitmentTemplateDeleteConflictError: class CommitmentTemplateDeleteConflictError extends Error {},
  CommitmentTemplateNotFoundError: class CommitmentTemplateNotFoundError extends Error {},
  CommitmentTemplateValidationError: class CommitmentTemplateValidationError extends Error {},
  createCommitmentTemplate: vi.fn(),
  deleteCommitmentTemplate: vi.fn(),
  getCommitmentTemplates: vi.fn(),
  updateCommitmentTemplate: vi.fn(),
  updateCommitmentTemplateActive: vi.fn(),
}));

vi.mock("./movements/getMovements.js", () => ({
  MovementValidationError: class MovementValidationError extends Error {},
  getMovements: vi.fn(),
}));

vi.mock("./movements/deleteMovement.js", () => ({
  MovementDeleteConflictError: class MovementDeleteConflictError extends Error {},
  MovementDeleteNotFoundError: class MovementDeleteNotFoundError extends Error {},
  deleteMovement: vi.fn(),
}));

vi.mock("./movements/updateMovement.js", () => ({
  MovementUpdateConflictError: class MovementUpdateConflictError extends Error {},
  MovementUpdateNotFoundError: class MovementUpdateNotFoundError extends Error {},
  MovementUpdateValidationError: class MovementUpdateValidationError extends Error {},
  updateMovement: vi.fn(),
}));

vi.mock("./transactions/createTransaction.js", () => ({
  TransactionValidationError: class TransactionValidationError extends Error {},
  createTransaction: vi.fn(),
}));

vi.mock("./prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

const mockedGetDashboardData = vi.mocked(getDashboardData);
const mockedGetAccounts = vi.mocked(getAccounts);
const mockedCreateAccount = vi.mocked(createAccount);
const mockedDeleteAccount = vi.mocked(deleteAccount);
const mockedDeactivateAccount = vi.mocked(deactivateAccount);
const mockedUpdateAccount = vi.mocked(updateAccount);
const mockedReactivateAccount = vi.mocked(reactivateAccount);
const mockedGetCommitments = vi.mocked(getCommitments);
const mockedCreateCommitment = vi.mocked(createCommitment);
const mockedDeleteCommitment = vi.mocked(deleteCommitment);
const mockedMarkCommitmentPaid = vi.mocked(markCommitmentPaid);
const mockedMarkCommitmentUnpaid = vi.mocked(markCommitmentUnpaid);
const mockedUpdateCommitment = vi.mocked(updateCommitment);
const mockedGetCommitmentTemplates = vi.mocked(getCommitmentTemplates);
const mockedCreateCommitmentTemplate = vi.mocked(createCommitmentTemplate);
const mockedDeleteCommitmentTemplate = vi.mocked(deleteCommitmentTemplate);
const mockedUpdateCommitmentTemplate = vi.mocked(updateCommitmentTemplate);
const mockedUpdateCommitmentTemplateActive = vi.mocked(updateCommitmentTemplateActive);
const mockedGetGoals = vi.mocked(getGoals);
const mockedCreateGoal = vi.mocked(createGoal);
const mockedDeleteGoal = vi.mocked(deleteGoal);
const mockedUpdateGoal = vi.mocked(updateGoal);
const mockedUpdateGoalStatus = vi.mocked(updateGoalStatus);
const mockedGetMovements = vi.mocked(getMovements);
const mockedDeleteMovement = vi.mocked(deleteMovement);
const mockedUpdateMovement = vi.mocked(updateMovement);
const mockedGetQuickEntryOptions = vi.mocked(getQuickEntryOptions);
const mockedCreateTransaction = vi.mocked(createTransaction);

process.env.AUTH_JWT_SECRET = "test-secret-with-enough-entropy";
process.env.AUTH_COOKIE_SECURE = "false";

const authCookie = `auth_token=${createSessionToken({ id: "user-demo", email: "demo@example.com", displayName: "Demo User" })}`;

describe("GET /dashboard", () => {
  beforeEach(() => {
    mockedGetDashboardData.mockReset();
  });

  it("uses the default dashboard month when month is omitted", async () => {
    mockedGetDashboardData.mockResolvedValueOnce({ currentMonthLabel: "Julio 2026" } as Awaited<
      ReturnType<typeof getDashboardData>
    >);

    const response = await request(app).get("/dashboard").expect(200);

    expect(response.body).toEqual({ currentMonthLabel: "Julio 2026" });
    expect(mockedGetDashboardData).toHaveBeenCalledWith(undefined);
  });

  it("rejects invalid month values with 400", async () => {
    mockedGetDashboardData.mockRejectedValueOnce(new Error("Invalid month format. Use YYYY-MM."));

    const response = await request(app).get("/dashboard?month=2026-13").expect(400);

    expect(response.body).toEqual({ error: "Invalid month format. Use YYYY-MM." });
  });

  it("rejects repeated month query values with 400", async () => {
    const response = await request(app).get("/dashboard?month=2026-07&month=2026-08").expect(400);

    expect(response.body).toEqual({ error: "Repeated month query values are not allowed." });
    expect(mockedGetDashboardData).not.toHaveBeenCalled();
  });
});

describe("GET /quick-entry/options", () => {
  beforeEach(() => {
    mockedGetQuickEntryOptions.mockReset();
  });

  it("returns quick-entry options", async () => {
    mockedGetQuickEntryOptions.mockResolvedValueOnce({
      accounts: [{ id: "account-demo-primary", nombre: "Cuenta Demo Principal", tipo: "OPERATIVA" }],
      categories: {
        GASTO: [{ id: "category-sent-transfer", nombre: "Transferencia enviada", icono: "send" }],
        INGRESO: [{ id: "category-salary", nombre: "Sueldo", icono: "salary" }],
      },
      lastUsedAccountId: "account-demo-primary",
    });

    const response = await request(app).get("/quick-entry/options").set("Cookie", authCookie).expect(200);

    expect(response.body).toEqual({
      accounts: [{ id: "account-demo-primary", nombre: "Cuenta Demo Principal", tipo: "OPERATIVA" }],
      categories: {
        GASTO: [{ id: "category-sent-transfer", nombre: "Transferencia enviada", icono: "send" }],
        INGRESO: [{ id: "category-salary", nombre: "Sueldo", icono: "salary" }],
      },
      lastUsedAccountId: "account-demo-primary",
    });
    expect(mockedGetQuickEntryOptions).toHaveBeenCalledWith("user-demo");
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get("/quick-entry/options").expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedGetQuickEntryOptions).not.toHaveBeenCalled();
  });
});

describe("GET /accounts", () => {
  beforeEach(() => {
    mockedGetAccounts.mockReset();
  });

  it("returns account groups and inactive accounts", async () => {
    mockedGetAccounts.mockResolvedValueOnce({
      groups: [{ type: AccountType.OPERATIVA, label: "Operativa", accounts: [{ id: "account-demo-primary", nombre: "Cuenta Demo Principal", tipo: AccountType.OPERATIVA, saldo: 450_200, activa: true, notas: null, hasHistory: true }] }],
      inactive: [{ id: "account-demo-international", nombre: "Cuenta Demo Internacional", tipo: AccountType.DEUDA, saldo: 0, activa: false, notas: null, hasHistory: false }],
    });

    const response = await request(app).get("/accounts").set("Cookie", authCookie).expect(200);

    expect(response.body).toEqual({
      groups: [{ type: "OPERATIVA", label: "Operativa", accounts: [{ id: "account-demo-primary", nombre: "Cuenta Demo Principal", tipo: "OPERATIVA", saldo: 450_200, activa: true, notas: null, hasHistory: true }] }],
      inactive: [{ id: "account-demo-international", nombre: "Cuenta Demo Internacional", tipo: "DEUDA", saldo: 0, activa: false, notas: null, hasHistory: false }],
    });
    expect(mockedGetAccounts).toHaveBeenCalledWith("user-demo");
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get("/accounts").expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedGetAccounts).not.toHaveBeenCalled();
  });
});

describe("POST /accounts", () => {
  beforeEach(() => {
    mockedCreateAccount.mockReset();
  });

  it("creates an account and returns the endpoint contract", async () => {
    const payload = { name: "Ahorro demo", type: "AHORRO", balance: 150_000 };
    mockedCreateAccount.mockResolvedValueOnce({
      id: "account-savings",
      nombre: "Ahorro demo",
      tipo: AccountType.AHORRO,
      saldo: 150_000,
      activa: true,
      notas: null,
      orden: 0,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    const response = await request(app).post("/accounts").set("Cookie", authCookie).send(payload).expect(201);

    expect(response.body.account).toMatchObject({
      id: "account-savings",
      nombre: "Ahorro demo",
      tipo: "AHORRO",
      saldo: 150_000,
      activa: true,
    });
    expect(mockedCreateAccount).toHaveBeenCalledWith(payload, "user-demo");
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).post("/accounts").send({ name: "Ahorro", type: "AHORRO", balance: 10 }).expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedCreateAccount).not.toHaveBeenCalled();
  });
});

describe("PATCH /accounts/:id", () => {
  beforeEach(() => {
    mockedUpdateAccount.mockReset();
  });

  it("updates an account and returns the endpoint contract", async () => {
    const payload = { name: "Cuenta Demo Principal", type: "OPERATIVA", balance: 460_000 };
    mockedUpdateAccount.mockResolvedValueOnce({
      id: "account-demo-primary",
      nombre: "Cuenta Demo Principal",
      tipo: AccountType.OPERATIVA,
      saldo: 460_000,
      activa: true,
      notas: null,
      orden: 0,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-08T00:00:00.000Z"),
    });

    const response = await request(app).patch("/accounts/account-demo-primary").set("Cookie", authCookie).send(payload).expect(200);

    expect(response.body.account).toMatchObject({
      id: "account-demo-primary",
      nombre: "Cuenta Demo Principal",
      tipo: "OPERATIVA",
      saldo: 460_000,
      activa: true,
    });
    expect(mockedUpdateAccount).toHaveBeenCalledWith("account-demo-primary", payload, "user-demo");
  });

  it("returns 400 for invalid account update payloads", async () => {
    const response = await request(app).patch("/accounts/account-demo-primary").set("Cookie", authCookie).send({ name: "", type: "OPERATIVA", balance: 10 }).expect(400);

    expect(response.body.error).toBe("Invalid request body");
    expect(mockedUpdateAccount).not.toHaveBeenCalled();
  });

  it("returns 404 when the account does not exist", async () => {
    mockedUpdateAccount.mockRejectedValueOnce(new AccountUpdateNotFoundError("Account not found."));

    const response = await request(app).patch("/accounts/missing").set("Cookie", authCookie).send({ name: "Cuenta", type: "AHORRO", balance: 10 }).expect(404);

    expect(response.body).toEqual({ error: "Account not found." });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).patch("/accounts/account-demo-primary").send({ name: "Cuenta", type: "AHORRO", balance: 10 }).expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedUpdateAccount).not.toHaveBeenCalled();
  });
});

describe("DELETE /accounts/:id", () => {
  beforeEach(() => {
    mockedDeleteAccount.mockReset();
  });

  it("returns deleted when the account has no history", async () => {
    mockedDeleteAccount.mockResolvedValueOnce({ status: "deleted" });

    const response = await request(app).delete("/accounts/account-empty").set("Cookie", authCookie).expect(200);

    expect(response.body).toEqual({ status: "deleted" });
    expect(mockedDeleteAccount).toHaveBeenCalledWith("account-empty", "user-demo");
  });

  it("returns 409 when the account has history", async () => {
    mockedDeleteAccount.mockRejectedValueOnce(new AccountDeleteConflictError("Account has financial history. Deactivate it instead of deleting it."));

    const response = await request(app).delete("/accounts/account-demo-primary").set("Cookie", authCookie).expect(409);

    expect(response.body).toEqual({ error: "Account has financial history. Deactivate it instead of deleting it." });
    expect(mockedDeleteAccount).toHaveBeenCalledWith("account-demo-primary", "user-demo");
  });

  it("returns 404 when the account does not exist", async () => {
    mockedDeleteAccount.mockRejectedValueOnce(new AccountDeleteNotFoundError("Account not found."));

    const response = await request(app).delete("/accounts/missing").set("Cookie", authCookie).expect(404);

    expect(response.body).toEqual({ error: "Account not found." });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).delete("/accounts/account-empty").expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedDeleteAccount).not.toHaveBeenCalled();
  });
});

describe("PATCH /accounts/:id/deactivate", () => {
  beforeEach(() => {
    mockedDeactivateAccount.mockReset();
  });

  it("deactivates an account and returns the endpoint contract", async () => {
    mockedDeactivateAccount.mockResolvedValueOnce({
      id: "account-demo-primary",
      nombre: "Cuenta Demo Principal",
      tipo: AccountType.OPERATIVA,
      saldo: 450_200,
      activa: false,
      notas: null,
      orden: 0,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-08T00:00:00.000Z"),
    });

    const response = await request(app).patch("/accounts/account-demo-primary/deactivate").set("Cookie", authCookie).expect(200);

    expect(response.body.account).toMatchObject({
      id: "account-demo-primary",
      nombre: "Cuenta Demo Principal",
      tipo: "OPERATIVA",
      saldo: 450_200,
      activa: false,
    });
    expect(mockedDeactivateAccount).toHaveBeenCalledWith("account-demo-primary", "user-demo");
  });

  it("returns 404 when the account does not exist", async () => {
    mockedDeactivateAccount.mockRejectedValueOnce(new AccountDeactivateNotFoundError("Account not found."));

    const response = await request(app).patch("/accounts/missing/deactivate").set("Cookie", authCookie).expect(404);

    expect(response.body).toEqual({ error: "Account not found." });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).patch("/accounts/account-demo-primary/deactivate").expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedDeactivateAccount).not.toHaveBeenCalled();
  });
});

describe("PATCH /accounts/:id/reactivate", () => {
  beforeEach(() => {
    mockedReactivateAccount.mockReset();
  });

  it("reactivates an account and returns the endpoint contract", async () => {
    mockedReactivateAccount.mockResolvedValueOnce({
      id: "account-demo-primary",
      nombre: "Cuenta Demo Principal",
      tipo: AccountType.OPERATIVA,
      saldo: 450_200,
      activa: true,
      notas: null,
      orden: 0,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-08T00:00:00.000Z"),
    });

    const response = await request(app).patch("/accounts/account-demo-primary/reactivate").set("Cookie", authCookie).expect(200);

    expect(response.body.account).toMatchObject({
      id: "account-demo-primary",
      nombre: "Cuenta Demo Principal",
      tipo: "OPERATIVA",
      saldo: 450_200,
      activa: true,
    });
    expect(mockedReactivateAccount).toHaveBeenCalledWith("account-demo-primary", "user-demo");
  });

  it("returns 404 when the account does not exist", async () => {
    mockedReactivateAccount.mockRejectedValueOnce(new AccountReactivateNotFoundError("Account not found."));

    const response = await request(app).patch("/accounts/missing/reactivate").set("Cookie", authCookie).expect(404);

    expect(response.body).toEqual({ error: "Account not found." });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).patch("/accounts/account-demo-primary/reactivate").expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedReactivateAccount).not.toHaveBeenCalled();
  });
});

describe("GET /goals", () => {
  beforeEach(() => {
    mockedGetGoals.mockReset();
  });

  it("returns goal groups", async () => {
    mockedGetGoals.mockResolvedValueOnce({
      groups: [
        {
          status: GoalStatus.ACTIVA,
          label: "Activas",
          goals: [
            {
              id: "goal-vacations",
              nombre: "Vacaciones",
              montoObjetivo: 500_000,
              estado: GoalStatus.ACTIVA,
              notas: null,
              account: { id: "account-demo-wallet", nombre: "Billetera Demo", saldo: 225_000 },
              progressPercent: 45,
            },
          ],
        },
      ],
    });

    const response = await request(app).get("/goals").expect(200);

    expect(response.body).toEqual({
      groups: [
        {
          status: "ACTIVA",
          label: "Activas",
          goals: [
            {
              id: "goal-vacations",
              nombre: "Vacaciones",
              montoObjetivo: 500000,
              estado: "ACTIVA",
              notas: null,
              account: { id: "account-demo-wallet", nombre: "Billetera Demo", saldo: 225000 },
              progressPercent: 45,
            },
          ],
        },
      ],
    });
    expect(mockedGetGoals).toHaveBeenCalledOnce();
  });

  it("returns 500 when goal groups cannot be loaded", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedGetGoals.mockRejectedValueOnce(new Error("Database unavailable"));

    const response = await request(app).get("/goals").expect(500);

    expect(response.body).toEqual({ error: "Internal server error" });
    expect(mockedGetGoals).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});

describe("POST /goals", () => {
  beforeEach(() => {
    mockedCreateGoal.mockReset();
  });

  it("creates a goal and returns the endpoint contract", async () => {
    const payload = { name: "Vacaciones", targetAmount: 500_000, accountId: "account-demo-wallet", notes: "Viaje demo" };
    mockedCreateGoal.mockResolvedValueOnce(goalResponse({ notas: "Viaje demo" }));

    const response = await request(app).post("/goals").send(payload).expect(201);

    expect(response.body.goal).toEqual({
      id: "goal-vacations",
      nombre: "Vacaciones",
      montoObjetivo: 500_000,
      estado: "ACTIVA",
      notas: "Viaje demo",
      account: { id: "account-demo-wallet", nombre: "Billetera Demo", saldo: 225_000 },
      progressPercent: 45,
    });
    expect(mockedCreateGoal).toHaveBeenCalledWith(payload);
  });

  it("returns 400 for an invalid payload", async () => {
    const response = await request(app).post("/goals").send({ name: "", targetAmount: 0, accountId: "" }).expect(400);

    expect(response.body.error).toBe("Invalid request body");
    expect(mockedCreateGoal).not.toHaveBeenCalled();
  });

  it("returns 400 when the associated account is invalid", async () => {
    mockedCreateGoal.mockRejectedValueOnce(new GoalValidationError("La cuenta asociada debe estar activa."));

    const response = await request(app).post("/goals").send({ name: "Auto", targetAmount: 1_000_000, accountId: "inactive" }).expect(400);

    expect(response.body).toEqual({ error: "La cuenta asociada debe estar activa." });
  });
});

describe("PATCH /goals/:id", () => {
  beforeEach(() => {
    mockedUpdateGoal.mockReset();
  });

  it("updates a goal and returns the endpoint contract", async () => {
    const payload = { name: "Vacaciones 2027", targetAmount: 750_000, accountId: "account-demo-wallet", notes: null };
    mockedUpdateGoal.mockResolvedValueOnce(goalResponse({ nombre: "Vacaciones 2027", montoObjetivo: 750_000, notas: null, progressPercent: 30 }));

    const response = await request(app).patch("/goals/goal-vacations").send(payload).expect(200);

    expect(response.body.goal).toMatchObject({
      id: "goal-vacations",
      nombre: "Vacaciones 2027",
      montoObjetivo: 750_000,
      notas: null,
      progressPercent: 30,
    });
    expect(mockedUpdateGoal).toHaveBeenCalledWith("goal-vacations", payload);
  });

  it("allows updating a goal without notes", async () => {
    const payload = { name: "Vacaciones 2027", targetAmount: 750_000, accountId: "account-demo-wallet" };
    mockedUpdateGoal.mockResolvedValueOnce(goalResponse({ nombre: "Vacaciones 2027", montoObjetivo: 750_000, notas: "Viaje demo", progressPercent: 30 }));

    await request(app).patch("/goals/goal-vacations").send(payload).expect(200);

    expect(mockedUpdateGoal).toHaveBeenCalledWith("goal-vacations", payload);
  });

  it("returns 404 when the goal does not exist", async () => {
    mockedUpdateGoal.mockRejectedValueOnce(new GoalNotFoundError("Meta no encontrada."));

    const response = await request(app).patch("/goals/missing").send({ name: "Auto", targetAmount: 1_000_000, accountId: "account-demo-wallet" }).expect(404);

    expect(response.body).toEqual({ error: "Meta no encontrada." });
  });
});

describe("PATCH /goals/:id/status", () => {
  beforeEach(() => {
    mockedUpdateGoalStatus.mockReset();
  });

  it.each([GoalStatus.ACTIVA, GoalStatus.PAUSADA, GoalStatus.COMPLETADA])("updates goal status to %s", async (status) => {
    mockedUpdateGoalStatus.mockResolvedValueOnce(goalResponse({ estado: status }));

    const response = await request(app).patch("/goals/goal-vacations/status").send({ status }).expect(200);

    expect(response.body.goal.estado).toBe(status);
    expect(response.body.goal.progressPercent).toBe(45);
    expect(mockedUpdateGoalStatus).toHaveBeenCalledWith("goal-vacations", { status });
  });

  it("returns 400 for an invalid status", async () => {
    const response = await request(app).patch("/goals/goal-vacations/status").send({ status: "ARCHIVADA" }).expect(400);

    expect(response.body.error).toBe("Invalid request body");
    expect(mockedUpdateGoalStatus).not.toHaveBeenCalled();
  });

  it("returns 404 when the goal does not exist", async () => {
    mockedUpdateGoalStatus.mockRejectedValueOnce(new GoalStatusNotFoundError("Meta no encontrada."));

    const response = await request(app).patch("/goals/missing/status").send({ status: "PAUSADA" }).expect(404);

    expect(response.body).toEqual({ error: "Meta no encontrada." });
  });
});

describe("DELETE /goals/:id", () => {
  beforeEach(() => {
    mockedDeleteGoal.mockReset();
  });

  it("deletes a goal and returns no content", async () => {
    mockedDeleteGoal.mockResolvedValueOnce(undefined);

    await request(app).delete("/goals/goal-vacations").expect(204);

    expect(mockedDeleteGoal).toHaveBeenCalledWith("goal-vacations");
  });

  it("returns 404 when the goal does not exist", async () => {
    mockedDeleteGoal.mockRejectedValueOnce(new GoalDeleteNotFoundError("Meta no encontrada."));

    const response = await request(app).delete("/goals/missing").expect(404);

    expect(response.body).toEqual({ error: "Meta no encontrada." });
  });
});

describe("GET /commitments", () => {
  beforeEach(() => {
    mockedGetCommitments.mockReset();
  });

  it("returns commitments for the selected month", async () => {
    mockedGetCommitments.mockResolvedValueOnce({
      currentMonth: "2026-07",
      currentMonthLabel: "Julio 2026",
      summary: { pendingCount: 1, pendingTotal: 350_000 },
      groups: [
        {
          status: CommitmentStatus.PENDIENTE,
          label: "Pendientes",
          commitments: [
            {
              id: "commitment-rent",
              templateId: null,
              nombre: "Arriendo",
              tipo: CommitmentType.RECURRENTE,
              monto: 350_000,
              estado: CommitmentStatus.PENDIENTE,
              fechaVencimiento: "2026-07-05",
              dueDay: 5,
              notas: null,
              canRevertPayment: false,
            },
          ],
        },
        { status: CommitmentStatus.PAGADO, label: "Pagados", commitments: [] },
      ],
    });

    const response = await request(app).get("/commitments?month=2026-07").expect(200);

    expect(response.body).toEqual({
      currentMonth: "2026-07",
      currentMonthLabel: "Julio 2026",
      summary: { pendingCount: 1, pendingTotal: 350000 },
      groups: [
        {
          status: "PENDIENTE",
          label: "Pendientes",
          commitments: [
            {
              id: "commitment-rent",
              templateId: null,
              nombre: "Arriendo",
              tipo: "RECURRENTE",
              monto: 350000,
              estado: "PENDIENTE",
              fechaVencimiento: "2026-07-05",
              dueDay: 5,
              notas: null,
              canRevertPayment: false,
            },
          ],
        },
        { status: "PAGADO", label: "Pagados", commitments: [] },
      ],
    });
    expect(mockedGetCommitments).toHaveBeenCalledWith("2026-07");
  });

  it("uses the default commitments month when month is omitted", async () => {
    mockedGetCommitments.mockResolvedValueOnce({ currentMonth: "2026-07", currentMonthLabel: "Julio 2026", summary: { pendingCount: 0, pendingTotal: 0 }, groups: [] });

    await request(app).get("/commitments").expect(200);

    expect(mockedGetCommitments).toHaveBeenCalledWith(undefined);
  });

  it("returns 400 for invalid commitment month values", async () => {
    mockedGetCommitments.mockRejectedValueOnce(new CommitmentValidationError("Invalid month format. Use YYYY-MM."));

    const response = await request(app).get("/commitments?month=2026-13").expect(400);

    expect(response.body).toEqual({ error: "Invalid month format. Use YYYY-MM." });
  });

  it("rejects repeated commitment month values with 400", async () => {
    const response = await request(app).get("/commitments?month=2026-07&month=2026-08").expect(400);

    expect(response.body).toEqual({ error: "Repeated month query values are not allowed." });
    expect(mockedGetCommitments).not.toHaveBeenCalled();
  });
});

describe("commitment template routes", () => {
  beforeEach(() => {
    mockedGetCommitmentTemplates.mockReset();
    mockedCreateCommitmentTemplate.mockReset();
    mockedDeleteCommitmentTemplate.mockReset();
    mockedUpdateCommitmentTemplate.mockReset();
    mockedUpdateCommitmentTemplateActive.mockReset();
    mockedGetCommitments.mockReset();
    mockedCreateTransaction.mockReset();
  });

  it("lists commitment templates", async () => {
    mockedGetCommitmentTemplates.mockResolvedValueOnce([
      { id: "template-rent", nombre: "Arriendo", tipo: CommitmentType.RECURRENTE, montoDefault: 350_000, diaVencimiento: 5, activa: true, notas: null },
      { id: "template-play", nombre: "Play", tipo: CommitmentType.RECURRENTE, montoDefault: 7_000, diaVencimiento: 20, activa: false, notas: null },
    ]);

    const response = await request(app).get("/commitment-templates").expect(200);

    expect(response.body).toEqual({
      templates: [
        { id: "template-rent", nombre: "Arriendo", tipo: "RECURRENTE", montoDefault: 350000, diaVencimiento: 5, activa: true, notas: null },
        { id: "template-play", nombre: "Play", tipo: "RECURRENTE", montoDefault: 7000, diaVencimiento: 20, activa: false, notas: null },
      ],
    });
  });

  it("creates a commitment template", async () => {
    const payload = { nombre: "Internet", tipo: "RECURRENTE", montoDefault: 29_990, diaVencimiento: 12, notas: "Fibra hogar" };
    mockedCreateCommitmentTemplate.mockResolvedValueOnce({ id: "template-internet", nombre: "Internet", tipo: CommitmentType.RECURRENTE, montoDefault: 29_990, diaVencimiento: 12, activa: true, notas: "Fibra hogar" });

    const response = await request(app).post("/commitment-templates").send(payload).expect(201);

    expect(response.body.template).toEqual({ id: "template-internet", nombre: "Internet", tipo: "RECURRENTE", montoDefault: 29990, diaVencimiento: 12, activa: true, notas: "Fibra hogar" });
    expect(mockedCreateCommitmentTemplate).toHaveBeenCalledWith(payload);
    expect(mockedGetCommitments).not.toHaveBeenCalled();
    expect(mockedCreateTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for template create validation errors", async () => {
    mockedCreateCommitmentTemplate.mockRejectedValueOnce(new CommitmentTemplateValidationError("montoDefault must be an integer greater than zero."));

    const response = await request(app).post("/commitment-templates").send({ nombre: "Internet", tipo: "RECURRENTE", montoDefault: 0 }).expect(400);

    expect(response.body).toEqual({ error: "montoDefault must be an integer greater than zero." });
  });

  it("updates only the template active state", async () => {
    mockedUpdateCommitmentTemplateActive.mockResolvedValueOnce({
      id: "template-rent",
      nombre: "Arriendo",
      tipo: CommitmentType.RECURRENTE,
      montoDefault: 350_000,
      diaVencimiento: 5,
      activa: false,
      notas: null,
    });

    const response = await request(app).patch("/commitment-templates/template-rent").send({ activa: false }).expect(200);

    expect(response.body.template).toEqual({
      id: "template-rent",
      nombre: "Arriendo",
      tipo: "RECURRENTE",
      montoDefault: 350000,
      diaVencimiento: 5,
      activa: false,
      notas: null,
    });
    expect(mockedUpdateCommitmentTemplateActive).toHaveBeenCalledWith("template-rent", { activa: false });
    expect(mockedGetCommitments).not.toHaveBeenCalled();
    expect(mockedCreateTransaction).not.toHaveBeenCalled();
  });

  it("edits commitment template fields", async () => {
    const payload = { nombre: "Arriendo casa", tipo: "RECURRENTE", montoDefault: 360_000, diaVencimiento: 8, notas: "Reajuste", activa: false };
    mockedUpdateCommitmentTemplate.mockResolvedValueOnce({ id: "template-rent", nombre: "Arriendo casa", tipo: CommitmentType.RECURRENTE, montoDefault: 360_000, diaVencimiento: 8, activa: false, notas: "Reajuste" });

    const response = await request(app).patch("/commitment-templates/template-rent").send(payload).expect(200);

    expect(response.body.template).toEqual({ id: "template-rent", nombre: "Arriendo casa", tipo: "RECURRENTE", montoDefault: 360000, diaVencimiento: 8, activa: false, notas: "Reajuste" });
    expect(mockedUpdateCommitmentTemplate).toHaveBeenCalledWith("template-rent", payload);
    expect(mockedUpdateCommitmentTemplateActive).not.toHaveBeenCalled();
    expect(mockedGetCommitments).not.toHaveBeenCalled();
    expect(mockedCreateTransaction).not.toHaveBeenCalled();
  });

  it("returns 404 instead of 500 when a template does not exist", async () => {
    mockedUpdateCommitmentTemplateActive.mockRejectedValueOnce(new CommitmentTemplateNotFoundError("Commitment template not found."));

    const response = await request(app).patch("/commitment-templates/missing").send({ activa: false }).expect(404);

    expect(response.body).toEqual({ error: "Commitment template not found." });
  });

  it("returns 404 for missing template edits", async () => {
    mockedUpdateCommitmentTemplate.mockRejectedValueOnce(new CommitmentTemplateNotFoundError("Commitment template not found."));

    const response = await request(app).patch("/commitment-templates/missing").send({ nombre: "Internet", tipo: "RECURRENTE", montoDefault: 29_990, diaVencimiento: null }).expect(404);

    expect(response.body).toEqual({ error: "Commitment template not found." });
  });

  it("returns 400 for invalid active-state payloads", async () => {
    mockedUpdateCommitmentTemplateActive.mockRejectedValueOnce(new CommitmentTemplateValidationError("activa must be a boolean."));

    const response = await request(app).patch("/commitment-templates/template-rent").send({ activa: "false" }).expect(400);

    expect(response.body).toEqual({ error: "activa must be a boolean." });
  });

  it("deletes a commitment template and returns no content", async () => {
    mockedDeleteCommitmentTemplate.mockResolvedValueOnce(undefined);

    await request(app).delete("/commitment-templates/template-play").expect(204);

    expect(mockedDeleteCommitmentTemplate).toHaveBeenCalledWith("template-play");
    expect(mockedGetCommitments).not.toHaveBeenCalled();
    expect(mockedCreateTransaction).not.toHaveBeenCalled();
  });

  it("returns 404 for missing template deletion", async () => {
    mockedDeleteCommitmentTemplate.mockRejectedValueOnce(new CommitmentTemplateNotFoundError("Commitment template not found."));

    const response = await request(app).delete("/commitment-templates/missing").expect(404);

    expect(response.body).toEqual({ error: "Commitment template not found." });
  });

  it("returns 409 when deleting a template that generated commitments", async () => {
    mockedDeleteCommitmentTemplate.mockRejectedValueOnce(new CommitmentTemplateDeleteConflictError("Commitment template has generated commitments."));

    const response = await request(app).delete("/commitment-templates/template-rent").expect(409);

    expect(response.body).toEqual({ error: "Commitment template has generated commitments." });
  });
});

describe("PATCH /commitments/:id/pay", () => {
  beforeEach(() => {
    mockedMarkCommitmentPaid.mockReset();
  });

  it("marks a commitment paid", async () => {
    mockedMarkCommitmentPaid.mockResolvedValueOnce({
      id: "commitment-rent",
      nombre: "Arriendo",
      tipo: CommitmentType.RECURRENTE,
      monto: 350_000,
      estado: CommitmentStatus.PAGADO,
      fechaVencimiento: new Date("2026-07-05T00:00:00.000Z"),
      mes: 7,
      anio: 2026,
      notas: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-05T00:00:00.000Z"),
      templateId: null,
      paymentTransactionId: "transaction-payment",
    });

    const paymentPayload = { accountId: "account-demo-primary", categoryId: "category-services" };

    const response = await request(app).patch("/commitments/commitment-rent/pay").send(paymentPayload).expect(200);

    expect(response.body.commitment).toMatchObject({ id: "commitment-rent", estado: "PAGADO" });
    expect(mockedMarkCommitmentPaid).toHaveBeenCalledWith("commitment-rent", paymentPayload);
  });

  it("returns 404 when the commitment does not exist", async () => {
    mockedMarkCommitmentPaid.mockRejectedValueOnce(new CommitmentNotFoundError("Commitment not found."));

    const response = await request(app).patch("/commitments/missing/pay").expect(404);

    expect(response.body).toEqual({ error: "Commitment not found." });
  });

  it("returns 400 for invalid payment input", async () => {
    mockedMarkCommitmentPaid.mockRejectedValueOnce(new CommitmentPaymentValidationError("Account not found or inactive."));

    const response = await request(app).patch("/commitments/commitment-rent/pay").send({ accountId: "missing", categoryId: "category-services" }).expect(400);

    expect(response.body).toEqual({ error: "Account not found or inactive." });
  });

  it.each([
    { payload: "not-an-object", message: "Request body must be an object." },
    { payload: { accountId: " ", categoryId: "category-services" }, message: "accountId is required." },
    { payload: { accountId: "account-demo-primary" }, message: "categoryId is required." },
    { payload: { accountId: "account-demo-primary", categoryId: " " }, message: "categoryId is required." },
  ])("returns 400 instead of 500 for malformed payment payloads", async ({ payload, message }) => {
    mockedMarkCommitmentPaid.mockRejectedValueOnce(new CommitmentPaymentValidationError(message));

    const response = await request(app).patch("/commitments/commitment-rent/pay").send(payload).expect(400);

    expect(response.body).toEqual({ error: message });
  });

  it("returns 200 for already paid commitments", async () => {
    mockedMarkCommitmentPaid.mockResolvedValueOnce({
      id: "commitment-phone",
      nombre: "Plan celular",
      tipo: CommitmentType.RECURRENTE,
      monto: 15_000,
      estado: CommitmentStatus.PAGADO,
      fechaVencimiento: new Date("2026-07-03T00:00:00.000Z"),
      mes: 7,
      anio: 2026,
      notas: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      templateId: null,
      paymentTransactionId: "transaction-payment",
    });

    const paymentPayload = { accountId: "account-demo-primary", categoryId: "category-services" };

    const response = await request(app).patch("/commitments/commitment-phone/pay").send(paymentPayload).expect(200);

    expect(response.body.commitment.estado).toBe("PAGADO");
    expect(mockedMarkCommitmentPaid).toHaveBeenCalledWith("commitment-phone", paymentPayload);
  });
});

describe("PATCH /commitments/:id/unpay", () => {
  beforeEach(() => {
    mockedMarkCommitmentUnpaid.mockReset();
  });

  it("marks a paid commitment pending", async () => {
    mockedMarkCommitmentUnpaid.mockResolvedValueOnce({
      id: "commitment-rent",
      nombre: "Arriendo",
      tipo: CommitmentType.RECURRENTE,
      monto: 350_000,
      estado: CommitmentStatus.PENDIENTE,
      fechaVencimiento: new Date("2026-07-05T00:00:00.000Z"),
      mes: 7,
      anio: 2026,
      notas: null,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-05T00:00:00.000Z"),
      templateId: null,
      paymentTransactionId: null,
    });

    const response = await request(app).patch("/commitments/commitment-rent/unpay").expect(200);

    expect(response.body.commitment).toMatchObject({ id: "commitment-rent", estado: "PENDIENTE" });
    expect(mockedMarkCommitmentUnpaid).toHaveBeenCalledWith("commitment-rent");
  });

  it("returns 400 when reverting an unpaid commitment", async () => {
    mockedMarkCommitmentUnpaid.mockRejectedValueOnce(new CommitmentPaymentValidationError("Only paid commitments can be reverted."));

    const response = await request(app).patch("/commitments/commitment-rent/unpay").expect(400);

    expect(response.body).toEqual({ error: "Only paid commitments can be reverted." });
  });

  it("returns 409 when the linked payment transaction is missing", async () => {
    mockedMarkCommitmentUnpaid.mockRejectedValueOnce(new CommitmentPaymentConflictError("Linked payment transaction not found."));

    const response = await request(app).patch("/commitments/commitment-rent/unpay").expect(409);

    expect(response.body).toEqual({ error: "Linked payment transaction not found." });
  });
});

describe("POST /commitments", () => {
  beforeEach(() => {
    mockedCreateCommitment.mockReset();
  });

  it("creates a commitment and returns the endpoint contract", async () => {
    const payload = { nombre: "Internet", tipo: "RECURRENTE", monto: 29_990, fechaVencimiento: "2026-07-12", notas: "Fibra hogar" };
    mockedCreateCommitment.mockResolvedValueOnce({
      id: "commitment-internet",
      nombre: "Internet",
      tipo: CommitmentType.RECURRENTE,
      monto: 29_990,
      estado: CommitmentStatus.PENDIENTE,
      fechaVencimiento: new Date("2026-07-12T00:00:00.000Z"),
      mes: 7,
      anio: 2026,
      notas: "Fibra hogar",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
      templateId: null,
      paymentTransactionId: null,
    });

    const response = await request(app).post("/commitments").send(payload).expect(201);

    expect(response.body.commitment).toMatchObject({
      id: "commitment-internet",
      nombre: "Internet",
      tipo: "RECURRENTE",
      monto: 29_990,
      estado: "PENDIENTE",
    });
    expect(mockedCreateCommitment).toHaveBeenCalledWith(payload);
  });

  it("returns 400 for commitment validation errors", async () => {
    mockedCreateCommitment.mockRejectedValueOnce(new CommitmentCreateValidationError("Amount must be an integer greater than zero."));

    const response = await request(app).post("/commitments").send({ nombre: "Internet", tipo: "RECURRENTE", monto: 0 }).expect(400);

    expect(response.body).toEqual({ error: "Amount must be an integer greater than zero." });
  });

  it("returns 500 when commitment creation fails unexpectedly", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockedCreateCommitment.mockRejectedValueOnce(new Error("Database unavailable"));

    const response = await request(app).post("/commitments").send({ nombre: "Internet", tipo: "RECURRENTE", monto: 10_000, fechaVencimiento: "2026-07-10" }).expect(500);

    expect(response.body).toEqual({ error: "Internal server error" });
    consoleError.mockRestore();
  });
});

describe("PATCH /commitments/:id", () => {
  beforeEach(() => {
    mockedUpdateCommitment.mockReset();
  });

  it("updates a commitment and returns the endpoint contract", async () => {
    const payload = { nombre: "Luz casa", tipo: "VARIABLE", monto: 52_000, fechaVencimiento: "2026-07-18", notas: "Boleta ajustada" };
    mockedUpdateCommitment.mockResolvedValueOnce({
      id: "commitment-light",
      nombre: "Luz casa",
      tipo: CommitmentType.VARIABLE,
      monto: 52_000,
      estado: CommitmentStatus.PENDIENTE,
      fechaVencimiento: new Date("2026-07-18T00:00:00.000Z"),
      mes: 7,
      anio: 2026,
      notas: "Boleta ajustada",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-08T00:00:00.000Z"),
      templateId: null,
      paymentTransactionId: null,
    });

    const response = await request(app).patch("/commitments/commitment-light").send(payload).expect(200);

    expect(response.body.commitment).toMatchObject({ id: "commitment-light", nombre: "Luz casa", tipo: "VARIABLE", monto: 52_000 });
    expect(mockedUpdateCommitment).toHaveBeenCalledWith("commitment-light", payload);
  });

  it("returns 404 when the commitment does not exist", async () => {
    mockedUpdateCommitment.mockRejectedValueOnce(new CommitmentUpdateNotFoundError("Commitment not found."));

    const response = await request(app).patch("/commitments/missing").send({ nombre: "Internet", tipo: "RECURRENTE", monto: 29_990, fechaVencimiento: "2026-07-12" }).expect(404);

    expect(response.body).toEqual({ error: "Commitment not found." });
  });

  it("returns 400 for commitment update validation errors", async () => {
    mockedUpdateCommitment.mockRejectedValueOnce(new CommitmentUpdateValidationError("Amount must be an integer greater than zero."));

    const response = await request(app).patch("/commitments/commitment-light").send({ nombre: "Luz", tipo: "VARIABLE", monto: 0, fechaVencimiento: "2026-07-15" }).expect(400);

    expect(response.body).toEqual({ error: "Amount must be an integer greater than zero." });
  });

  it("returns 409 when attempting to edit a paid commitment", async () => {
    mockedUpdateCommitment.mockRejectedValueOnce(new CommitmentUpdateConflictError("Paid commitments cannot be edited."));

    const response = await request(app).patch("/commitments/commitment-phone").send({ nombre: "Plan celular", tipo: "RECURRENTE", monto: 15_000, fechaVencimiento: "2026-07-03" }).expect(409);

    expect(response.body).toEqual({ error: "Paid commitments cannot be edited." });
  });
});

describe("DELETE /commitments/:id", () => {
  beforeEach(() => {
    mockedDeleteCommitment.mockReset();
  });

  it("deletes a pending commitment and returns no content", async () => {
    mockedDeleteCommitment.mockResolvedValueOnce(undefined);

    await request(app).delete("/commitments/commitment-light").expect(204);

    expect(mockedDeleteCommitment).toHaveBeenCalledWith("commitment-light");
  });

  it("returns 404 when the commitment does not exist", async () => {
    mockedDeleteCommitment.mockRejectedValueOnce(new CommitmentDeleteNotFoundError("Commitment not found."));

    const response = await request(app).delete("/commitments/missing").expect(404);

    expect(response.body).toEqual({ error: "Commitment not found." });
  });

  it("returns 409 when attempting to delete a paid commitment", async () => {
    mockedDeleteCommitment.mockRejectedValueOnce(new CommitmentDeleteConflictError("Paid commitments cannot be deleted."));

    const response = await request(app).delete("/commitments/commitment-phone").expect(409);

    expect(response.body).toEqual({ error: "Paid commitments cannot be deleted." });
  });
});

describe("GET /movements", () => {
  beforeEach(() => {
    mockedGetMovements.mockReset();
  });

  it("returns movement list data with supported filters", async () => {
    mockedGetMovements.mockResolvedValueOnce({
      currentMonth: "2026-07",
      filters: { accounts: [], categories: [] },
      groups: [],
    });

    const response = await request(app)
      .get("/movements?month=2026-07&accountId=account-demo-primary&categoryId=category-food")
      .set("Cookie", authCookie)
      .expect(200);

    expect(response.body).toEqual({ currentMonth: "2026-07", filters: { accounts: [], categories: [] }, groups: [] });
    expect(mockedGetMovements).toHaveBeenCalledWith("user-demo", {
      month: "2026-07",
      accountId: "account-demo-primary",
      categoryId: "category-food",
    });
  });

  it("returns 400 for invalid movement month values", async () => {
    mockedGetMovements.mockRejectedValueOnce(new MovementValidationError("Invalid month format. Use YYYY-MM."));

    const response = await request(app).get("/movements?month=2026-13").set("Cookie", authCookie).expect(400);

    expect(response.body).toEqual({ error: "Invalid month format. Use YYYY-MM." });
  });

  it("rejects repeated movement query values with 400", async () => {
    const response = await request(app).get("/movements?accountId=a&accountId=b").set("Cookie", authCookie).expect(400);

    expect(response.body).toEqual({ error: "Repeated accountId query values are not allowed." });
    expect(mockedGetMovements).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get("/movements").expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedGetMovements).not.toHaveBeenCalled();
  });
});

describe("PATCH /movements/:id", () => {
  beforeEach(() => {
    mockedUpdateMovement.mockReset();
  });

  it("updates a regular movement and returns it in the endpoint contract", async () => {
    mockedUpdateMovement.mockResolvedValueOnce({
      id: "tx-grocery",
      tipo: "GASTO",
      monto: 35_000,
      descripcion: "Compra ajustada",
      fecha: new Date("2026-07-06T00:00:00.000Z"),
      notas: null,
      accountId: "account-demo-secondary",
      categoryId: "category-supermarket",
      transferId: null,
      createdAt: new Date("2026-07-05T12:00:00.000Z"),
      updatedAt: new Date("2026-07-06T12:00:00.000Z"),
    });
    const payload = {
      tipo: "GASTO",
      monto: 35_000,
      accountId: "account-demo-secondary",
      categoryId: "category-supermarket",
      descripcion: "Compra ajustada",
      fecha: "2026-07-06",
    };

    const response = await request(app).patch("/movements/tx-grocery").set("Cookie", authCookie).send(payload).expect(200);

    expect(response.body).toMatchObject({
      movement: {
        id: "tx-grocery",
        tipo: "GASTO",
        monto: 35_000,
        descripcion: "Compra ajustada",
        accountId: "account-demo-secondary",
        categoryId: "category-supermarket",
        transferId: null,
      },
    });
    expect(mockedUpdateMovement).toHaveBeenCalledWith("tx-grocery", payload, "user-demo");
  });

  it("updates a transfer and returns both transfer movements in the endpoint contract", async () => {
    mockedUpdateMovement.mockResolvedValueOnce([
      {
        id: "tx-transfer-out",
        tipo: "GASTO",
        monto: 45_000,
        descripcion: "Ahorro",
        fecha: new Date("2026-07-06T00:00:00.000Z"),
        notas: null,
        accountId: "account-origin",
        categoryId: null,
        transferId: "transfer-1",
        createdAt: new Date("2026-07-05T12:00:00.000Z"),
        updatedAt: new Date("2026-07-06T12:00:00.000Z"),
      },
      {
        id: "tx-transfer-in",
        tipo: "INGRESO",
        monto: 45_000,
        descripcion: "Ahorro",
        fecha: new Date("2026-07-06T00:00:00.000Z"),
        notas: null,
        accountId: "account-destination",
        categoryId: null,
        transferId: "transfer-1",
        createdAt: new Date("2026-07-05T12:00:00.000Z"),
        updatedAt: new Date("2026-07-06T12:00:00.000Z"),
      },
    ]);
    const payload = {
      tipo: "TRANSFERENCIA",
      monto: 45_000,
      fromAccountId: "account-origin",
      toAccountId: "account-destination",
      descripcion: "Ahorro",
      fecha: "2026-07-06",
    };

    const response = await request(app).patch("/movements/transfer-1").set("Cookie", authCookie).send(payload).expect(200);

    expect(response.body).toMatchObject({
      movement: [
        {
          id: "tx-transfer-out",
          tipo: "GASTO",
          monto: 45_000,
          descripcion: "Ahorro",
          accountId: "account-origin",
          categoryId: null,
          transferId: "transfer-1",
        },
        {
          id: "tx-transfer-in",
          tipo: "INGRESO",
          monto: 45_000,
          descripcion: "Ahorro",
          accountId: "account-destination",
          categoryId: null,
          transferId: "transfer-1",
        },
      ],
    });
    expect(mockedUpdateMovement).toHaveBeenCalledWith("transfer-1", payload, "user-demo");
  });

  it("returns 404 when the movement does not exist", async () => {
    mockedUpdateMovement.mockRejectedValueOnce(new MovementUpdateNotFoundError("Movement not found."));

    const response = await request(app).patch("/movements/missing").set("Cookie", authCookie).send({}).expect(404);

    expect(response.body).toEqual({ error: "Movement not found." });
  });

  it("returns 400 for invalid movement update payloads", async () => {
    mockedUpdateMovement.mockRejectedValueOnce(new MovementUpdateValidationError("Amount must be an integer greater than zero."));

    const response = await request(app).patch("/movements/tx-grocery").set("Cookie", authCookie).send({ monto: 0 }).expect(400);

    expect(response.body).toEqual({ error: "Amount must be an integer greater than zero." });
  });

  it("returns 409 when a transfer pair is invalid or stale", async () => {
    mockedUpdateMovement.mockRejectedValueOnce(new MovementUpdateConflictError("Transfer pair is inconsistent. Please reload and try again."));

    const response = await request(app).patch("/movements/transfer-1").set("Cookie", authCookie).send({ tipo: "TRANSFERENCIA" }).expect(409);

    expect(response.body).toEqual({ error: "Transfer pair is inconsistent. Please reload and try again." });
  });

  it("returns 409 when a movement edit conflicts with another transaction", async () => {
    mockedUpdateMovement.mockRejectedValueOnce(new MovementUpdateConflictError("Movement changed while editing. Please reload and try again."));

    const response = await request(app).patch("/movements/tx-grocery").set("Cookie", authCookie).send({}).expect(409);

    expect(response.body).toEqual({ error: "Movement changed while editing. Please reload and try again." });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).patch("/movements/tx-grocery").send({}).expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedUpdateMovement).not.toHaveBeenCalled();
  });
});

describe("DELETE /movements/:id", () => {
  beforeEach(() => {
    mockedDeleteMovement.mockReset();
  });

  it("deletes a regular movement and returns no content", async () => {
    mockedDeleteMovement.mockResolvedValueOnce();

    await request(app).delete("/movements/tx-grocery").set("Cookie", authCookie).expect(204);

    expect(mockedDeleteMovement).toHaveBeenCalledWith("tx-grocery", "user-demo");
  });

  it("deletes a transfer movement and returns no content", async () => {
    mockedDeleteMovement.mockResolvedValueOnce();

    await request(app).delete("/movements/transfer-1").set("Cookie", authCookie).expect(204);

    expect(mockedDeleteMovement).toHaveBeenCalledWith("transfer-1", "user-demo");
  });

  it("returns 404 when the movement does not exist", async () => {
    mockedDeleteMovement.mockRejectedValueOnce(new MovementDeleteNotFoundError("Movement not found."));

    const response = await request(app).delete("/movements/missing").set("Cookie", authCookie).expect(404);

    expect(response.body).toEqual({ error: "Movement not found." });
  });

  it("returns 409 when a transfer pair is invalid", async () => {
    mockedDeleteMovement.mockRejectedValueOnce(new MovementDeleteConflictError("Transfer pair is invalid. Please reload and try again."));

    const response = await request(app).delete("/movements/transfer-1").set("Cookie", authCookie).expect(409);

    expect(response.body).toEqual({ error: "Transfer pair is invalid. Please reload and try again." });
  });

  it("returns 409 when a movement delete conflicts with another transaction", async () => {
    mockedDeleteMovement.mockRejectedValueOnce(new MovementDeleteConflictError("Movement changed while deleting. Please reload and try again."));

    const response = await request(app).delete("/movements/tx-grocery").set("Cookie", authCookie).expect(409);

    expect(response.body).toEqual({ error: "Movement changed while deleting. Please reload and try again." });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).delete("/movements/tx-grocery").expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedDeleteMovement).not.toHaveBeenCalled();
  });
});

describe("POST /transactions", () => {
  beforeEach(() => {
    mockedCreateTransaction.mockReset();
  });

  it("creates transactions and returns them in the endpoint contract", async () => {
    mockedCreateTransaction.mockResolvedValueOnce([
      {
        id: "tx-expense",
        tipo: "GASTO",
        monto: 1_000,
        descripcion: "Food",
        fecha: new Date("2026-07-05T12:00:00.000Z"),
        notas: null,
        accountId: "account-checking",
        categoryId: "category-food",
        transferId: null,
        createdAt: new Date("2026-07-05T12:00:00.000Z"),
        updatedAt: new Date("2026-07-05T12:00:00.000Z"),
      },
    ]);

    const payload = { tipo: "GASTO", monto: 1_000, accountId: "account-checking", categoryId: "category-food" };
    const response = await request(app).post("/transactions").set("Cookie", authCookie).send(payload).expect(201);

    expect(response.body).toMatchObject({
      transactions: [
        {
          id: "tx-expense",
          tipo: "GASTO",
          monto: 1_000,
          descripcion: "Food",
          accountId: "account-checking",
          categoryId: "category-food",
          transferId: null,
        },
      ],
    });
    expect(mockedCreateTransaction).toHaveBeenCalledWith(payload, "user-demo");
  });

  it("returns 400 for transaction validation errors", async () => {
    mockedCreateTransaction.mockRejectedValueOnce(new TransactionValidationError("Amount must be an integer greater than zero."));

    const response = await request(app).post("/transactions").set("Cookie", authCookie).send({ tipo: "GASTO", monto: 0 }).expect(400);

    expect(response.body).toEqual({ error: "Amount must be an integer greater than zero." });
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).post("/transactions").send({ tipo: "GASTO", monto: 1_000 }).expect(401);

    expect(response.body).toEqual({ error: "Authentication required." });
    expect(mockedCreateTransaction).not.toHaveBeenCalled();
  });
});

function goalResponse(overrides: Partial<{
  id: string;
  nombre: string;
  montoObjetivo: number;
  estado: GoalStatus;
  notas: string | null;
  account: { id: string; nombre: string; saldo: number };
  progressPercent: number;
}> = {}) {
  return {
    id: "goal-vacations",
    nombre: "Vacaciones",
    montoObjetivo: 500_000,
    estado: GoalStatus.ACTIVA,
    notas: null,
    account: { id: "account-demo-wallet", nombre: "Billetera Demo", saldo: 225_000 },
    progressPercent: 45,
    ...overrides,
  };
}
