import { z } from "zod";
import cors from "cors";
import express from "express";

import { requireAuth } from "./auth/middleware.js";
import { AuthenticationError, clearAuthCookie, createSessionToken, loginWithPassword, resolveCurrentUser, setAuthCookie } from "./auth/session.js";
import { getAccounts } from "./accounts/getAccounts.js";
import { createAccount } from "./accounts/createAccount.js";
import { AccountUpdateNotFoundError, LoanAccountConflictError, updateAccount } from "./accounts/updateAccount.js";
import { AccountDeleteConflictError, AccountDeleteNotFoundError, deleteAccount } from "./accounts/deleteAccount.js";
import { AccountReactivateNotFoundError, reactivateAccount } from "./accounts/reactivateAccount.js";
import { AccountDeactivateNotFoundError, deactivateAccount } from "./accounts/deactivateAccount.js";
import { CreateAccountDTO, GoalMutationDTO, GoalStatusUpdateDTO, UpdateAccountDTO } from "@finanzas-personales/shared-types";



import { CommitmentCreateValidationError, createCommitment } from "./commitments/createCommitment.js";
import { CommitmentDeleteConflictError, CommitmentDeleteNotFoundError, deleteCommitment } from "./commitments/deleteCommitment.js";
import { getCommitments, CommitmentValidationError } from "./commitments/getCommitments.js";
import { CommitmentNotFoundError, CommitmentPaymentConflictError, CommitmentPaymentValidationError, markCommitmentPaid, markCommitmentUnpaid } from "./commitments/markCommitmentPaid.js";
import { CommitmentUpdateConflictError, CommitmentUpdateNotFoundError, CommitmentUpdateValidationError, updateCommitment } from "./commitments/updateCommitment.js";
import { CommitmentTemplateDeleteConflictError, CommitmentTemplateNotFoundError, CommitmentTemplateValidationError, createCommitmentTemplate, deleteCommitmentTemplate, getCommitmentTemplates, updateCommitmentTemplate, updateCommitmentTemplateActive } from "./commitment-templates/commitmentTemplates.js";
import { getDashboardData } from "./dashboard/getDashboardData.js";
import { createGoal, GoalValidationError } from "./goals/createGoal.js";
import { deleteGoal, GoalDeleteNotFoundError } from "./goals/deleteGoal.js";
import { getGoals } from "./goals/getGoals.js";
import { GoalStatusNotFoundError, updateGoalStatus } from "./goals/updateGoalStatus.js";
import { GoalNotFoundError, updateGoal } from "./goals/updateGoal.js";
import { deleteMovement, MovementDeleteConflictError, MovementDeleteNotFoundError } from "./movements/deleteMovement.js";
import { getMovements, MovementValidationError } from "./movements/getMovements.js";
import { MovementUpdateConflictError, MovementUpdateNotFoundError, MovementUpdateValidationError, updateMovement } from "./movements/updateMovement.js";
import { getQuickEntryOptions } from "./quick-entry/getQuickEntryOptions.js";
import { createTransaction, TransactionValidationError } from "./transactions/createTransaction.js";
import { deleteLoan, getLoanById, getLoans, LoanConflictError, LoanNotFoundError, LoanValidationError, createLoan, repayLoan, updateLoan, updateLoanStatus } from "./loans/loans.js";

const app = express();

const LoginDTO = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/auth/login", async (request, response, next) => {
  try {
    const credentials = LoginDTO.parse(request.body);
    const user = await loginWithPassword(credentials.email, credentials.password);
    const token = createSessionToken(user);

    setAuthCookie(response, token);
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post("/auth/logout", (_request, response) => {
  clearAuthCookie(response);
  response.status(204).send();
});

app.get("/auth/session", async (request, response, next) => {
  try {
    const user = await resolveCurrentUser(request);

    if (!user) {
      response.status(401).json({ error: "Authentication required." });
      return;
    }

    response.json({ user });
  } catch (error) {
    next(error);
  }
});

// API contract: GET /dashboard accepts zero or one `month=YYYY-MM` query value.
// Missing month defaults to the seeded dashboard month; invalid or repeated values return 400.
app.get("/dashboard", requireAuth, async (request, response, next) => {
  try {
    if (Array.isArray(request.query.month)) {
      response.status(400).json({ error: "Repeated month query values are not allowed." });
      return;
    }

    const month = typeof request.query.month === "string" ? request.query.month : undefined;
    const dashboardData = await getDashboardData(request.currentUser!.id, month);

    response.json(dashboardData);
  } catch (error) {
    next(error);
  }
});

app.get("/quick-entry/options", requireAuth, async (request, response, next) => {
  try {
    response.json(await getQuickEntryOptions(request.currentUser!.id));
  } catch (error) {
    next(error);
  }
});

app.get("/accounts", requireAuth, async (request, response, next) => {
  try {
    response.json(await getAccounts(request.currentUser!.id));
  } catch (error) {
    next(error);
  }
});

app.post("/accounts", requireAuth, async (request, response, next) => {
  try {
    const createAccountDTO = CreateAccountDTO.parse(request.body);
    const account = await createAccount(createAccountDTO, request.currentUser!.id);
    response.status(201).json({ account });
  } catch (error) {
    next(error);
  }
});

app.patch("/accounts/:id", requireAuth, async (request, response, next) => {
  try {
    const updateAccountDTO = UpdateAccountDTO.parse(request.body);
    const account = await updateAccount(request.params.id, updateAccountDTO, request.currentUser!.id);
    response.json({ account });
  } catch (error) {
    next(error);
  }
});

app.patch("/accounts/:id/reactivate", requireAuth, async (request, response, next) => {
  try {
    const account = await reactivateAccount(request.params.id, request.currentUser!.id);
    response.json({ account });
  } catch (error) {
    next(error);
  }
});

app.patch("/accounts/:id/deactivate", requireAuth, async (request, response, next) => {
  try {
    const account = await deactivateAccount(request.params.id, request.currentUser!.id);
    response.json({ account });
  } catch (error) {
    next(error);
  }
});

app.delete("/accounts/:id", requireAuth, async (request, response, next) => {
  try {
    const result = await deleteAccount(request.params.id, request.currentUser!.id);

    response.json(result);
  } catch (error) {
    next(error);
  }
});



app.get("/goals", requireAuth, async (request, response, next) => {
  try {
    response.json(await getGoals(request.currentUser!.id));
  } catch (error) {
    next(error);
  }
});

app.post("/goals", requireAuth, async (request, response, next) => {
  try {
    const goalDTO = GoalMutationDTO.parse(request.body);
    const goal = await createGoal(goalDTO, request.currentUser!.id);

    response.status(201).json({ goal });
  } catch (error) {
    next(error);
  }
});

app.patch("/goals/:id", requireAuth, async (request, response, next) => {
  try {
    const goalDTO = GoalMutationDTO.parse(request.body);
    const goal = await updateGoal(request.params.id, goalDTO, request.currentUser!.id);

    response.json({ goal });
  } catch (error) {
    next(error);
  }
});

app.patch("/goals/:id/status", requireAuth, async (request, response, next) => {
  try {
    const statusDTO = GoalStatusUpdateDTO.parse(request.body);
    const goal = await updateGoalStatus(request.params.id, statusDTO, request.currentUser!.id);

    response.json({ goal });
  } catch (error) {
    next(error);
  }
});

app.delete("/goals/:id", requireAuth, async (request, response, next) => {
  try {
    await deleteGoal(request.params.id, request.currentUser!.id);

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.get("/commitments", requireAuth, async (request, response, next) => {
  try {
    const queryError = validateSingleValueQuery(request.query, ["month"]);

    if (queryError) {
      response.status(400).json({ error: queryError });
      return;
    }

    response.json(await getCommitments(request.currentUser!.id, getMonthQueryValue(request.query.month)));
  } catch (error) {
    next(error);
  }
});

app.get("/commitment-templates", requireAuth, async (request, response, next) => {
  try {
    response.json({ templates: await getCommitmentTemplates(request.currentUser!.id) });
  } catch (error) {
    next(error);
  }
});

app.post("/commitment-templates", requireAuth, async (request, response, next) => {
  try {
    const template = await createCommitmentTemplate(request.body, request.currentUser!.id);

    response.status(201).json({ template });
  } catch (error) {
    next(error);
  }
});

app.patch("/commitment-templates/:id", requireAuth, async (request, response, next) => {
  try {
    const bodyKeys = typeof request.body === "object" && request.body !== null && !Array.isArray(request.body)
      ? Object.keys(request.body)
      : [];
    const template = bodyKeys.length === 1 && bodyKeys[0] === "activa"
      ? await updateCommitmentTemplateActive(request.params.id, request.body, request.currentUser!.id)
      : await updateCommitmentTemplate(request.params.id, request.body, request.currentUser!.id);

    response.json({ template });
  } catch (error) {
    next(error);
  }
});

app.delete("/commitment-templates/:id", requireAuth, async (request, response, next) => {
  try {
    await deleteCommitmentTemplate(request.params.id, request.currentUser!.id);

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/commitments", requireAuth, async (request, response, next) => {
  try {
    const commitment = await createCommitment(request.body, request.currentUser!.id);

    response.status(201).json({ commitment });
  } catch (error) {
    next(error);
  }
});

app.patch("/commitments/:id", requireAuth, async (request, response, next) => {
  try {
    const commitment = await updateCommitment(request.params.id, request.body, request.currentUser!.id);

    response.json({ commitment });
  } catch (error) {
    next(error);
  }
});

app.delete("/commitments/:id", requireAuth, async (request, response, next) => {
  try {
    await deleteCommitment(request.params.id, request.currentUser!.id);

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.patch("/commitments/:id/pay", requireAuth, async (request, response, next) => {
  try {
    const commitment = await markCommitmentPaid(request.params.id, request.body, request.currentUser!.id);

    response.json({ commitment });
  } catch (error) {
    next(error);
  }
});

app.patch("/commitments/:id/unpay", requireAuth, async (request, response, next) => {
  try {
    const commitment = await markCommitmentUnpaid(request.params.id, request.currentUser!.id);

    response.json({ commitment });
  } catch (error) {
    next(error);
  }
});

app.get("/movements", requireAuth, async (request, response, next) => {
  try {
    const queryError = validateSingleValueQuery(request.query, ["month", "accountId", "categoryId"]);

    if (queryError) {
      response.status(400).json({ error: queryError });
      return;
    }

    response.json(
      await getMovements(request.currentUser!.id, {
        month: getMonthQueryValue(request.query.month),
        accountId: getOptionalQueryValue(request.query.accountId),
        categoryId: getOptionalQueryValue(request.query.categoryId),
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.patch("/movements/:id", requireAuth, async (request, response, next) => {
  try {
    const movement = await updateMovement(request.params.id, request.body, request.currentUser!.id);

    response.json({ movement });
  } catch (error) {
    next(error);
  }
});

app.delete("/movements/:id", requireAuth, async (request, response, next) => {
  try {
    await deleteMovement(request.params.id, request.currentUser!.id);

    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.post("/transactions", requireAuth, async (request, response, next) => {
  try {
    const transactions = await createTransaction(request.body, request.currentUser!.id);

    response.status(201).json({ transactions });
  } catch (error) {
    next(error);
  }
});

app.get("/loans", requireAuth, async (request, response, next) => {
  try {
    const queryError = validateSingleValueQuery(request.query, ["estado"]);
    if (queryError) { response.status(400).json({ error: queryError }); return; }
    const estado = getOptionalQueryValue(request.query.estado) as import("@prisma/client").LoanStatus | undefined;
    if (estado && !["PENDIENTE", "SALDADO", "INCOBRABLE"].includes(estado)) { response.status(400).json({ error: "Invalid loan status." }); return; }
    response.json(await getLoans(request.currentUser!.id, estado));
  } catch (error) { next(error); }
});

app.post("/loans", requireAuth, async (request, response, next) => {
  try { response.status(201).json({ loan: await createLoan(request.body, request.currentUser!.id) }); } catch (error) { next(error); }
});
app.get("/loans/:id", requireAuth, async (request, response, next) => {
  try { response.json({ loan: await getLoanById(request.params.id, request.currentUser!.id) }); } catch (error) { next(error); }
});
app.post("/loans/:id/repayments", requireAuth, async (request, response, next) => {
  try { response.status(201).json({ repayment: await repayLoan(request.params.id, request.body, request.currentUser!.id) }); } catch (error) { next(error); }
});
app.patch("/loans/:id", requireAuth, async (request, response, next) => {
  try { response.json({ loan: await updateLoan(request.params.id, request.body, request.currentUser!.id) }); } catch (error) { next(error); }
});
app.delete("/loans/:id", requireAuth, async (request, response, next) => {
  try { await deleteLoan(request.params.id, request.currentUser!.id); response.status(204).send(); } catch (error) { next(error); }
});
app.patch("/loans/:id/status", requireAuth, async (request, response, next) => {
  try { response.json({ loan: await updateLoanStatus(request.params.id, request.body, request.currentUser!.id) }); } catch (error) { next(error); }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request body", issues: error.issues });
    return;
  }

  if (error instanceof AuthenticationError) {
    response.status(401).json({ error: error.message });
    return;
  }

  if (error instanceof AccountUpdateNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof AccountDeleteNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof AccountDeleteConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof AccountDeactivateNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof AccountReactivateNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof LoanAccountConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof TransactionValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof LoanNotFoundError) { response.status(404).json({ error: error.message }); return; }
  if (error instanceof LoanValidationError) { response.status(400).json({ error: error.message }); return; }
  if (error instanceof LoanConflictError) { response.status(409).json({ error: error.message }); return; }

  if (error instanceof MovementValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof MovementUpdateNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof MovementUpdateValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof MovementUpdateConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof MovementDeleteNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof MovementDeleteConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof GoalNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof GoalValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof GoalDeleteNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof GoalStatusNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentCreateValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentUpdateNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentUpdateValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentUpdateConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentDeleteNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentDeleteConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentPaymentValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentPaymentConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentTemplateNotFoundError) {
    response.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentTemplateValidationError) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof CommitmentTemplateDeleteConflictError) {
    response.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof Error && error.message.includes("Invalid month format")) {
    response.status(400).json({ error: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

function validateSingleValueQuery(query: express.Request["query"], allowedKeys: string[]) {
  for (const key of Object.keys(query)) {
    if (!allowedKeys.includes(key)) {
      return `Unknown query parameter: ${key}.`;
    }
  }

  for (const key of allowedKeys) {
    if (Array.isArray(query[key])) {
      return `Repeated ${key} query values are not allowed.`;
    }
  }

  return null;
}

function getMonthQueryValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function getOptionalQueryValue(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export { app };
