import { authenticatedFetch } from "./authClient";
import type { AccountsResponse, Loan, LoansResponse } from "./loanTypes";

const LOANS_ENDPOINT = "/api/loans";
const ACCOUNTS_ENDPOINT = "/api/accounts";

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(input, init);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getLoans(signal?: AbortSignal) {
  return request<LoansResponse>(LOANS_ENDPOINT, { signal });
}

export function getLoan(id: string, signal?: AbortSignal) {
  return request<{ loan: Loan }>(`${LOANS_ENDPOINT}/${id}`, { signal });
}

export function getLoanAccounts(signal?: AbortSignal) {
  return request<AccountsResponse>(ACCOUNTS_ENDPOINT, { signal });
}

export function createLoan(payload: { persona: string; montoEntregado: number; accountId: string; fecha?: string; descripcion?: string; notas?: string | null }, signal?: AbortSignal) {
  return request<{ loan: Loan }>(LOANS_ENDPOINT, { ...jsonRequest("POST", payload), signal });
}

export function repayLoan(id: string, payload: { monto: number; accountId: string; fecha?: string; descripcion?: string; notas?: string | null }, signal?: AbortSignal) {
  return request<{ repayment: Loan["devoluciones"][number] }>(`${LOANS_ENDPOINT}/${id}/repayments`, { ...jsonRequest("POST", payload), signal });
}

export function updateLoan(id: string, payload: Partial<{ persona: string; montoEntregado: number; accountId: string; fecha: string; descripcion: string; notas: string | null }>) {
  return request<{ loan: Loan }>(`${LOANS_ENDPOINT}/${id}`, jsonRequest("PATCH", payload));
}

export function updateLoanStatus(id: string, estado: "PENDIENTE" | "INCOBRABLE") {
  return request<{ loan: Loan }>(`${LOANS_ENDPOINT}/${id}/status`, jsonRequest("PATCH", { estado }));
}

export function deleteLoan(id: string) {
  return request<void>(`${LOANS_ENDPOINT}/${id}`, { method: "DELETE" });
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
