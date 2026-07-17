import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoansPage } from "./LoansPage";
import type { Loan } from "./loanTypes";

const account = { id: "account-1", nombre: "Cuenta principal", tipo: "OPERATIVA", saldo: 500_000, activa: true };
const loans = [
  { id: "loan-1", persona: "Alex", montoEntregado: 100_000, estado: "PENDIENTE", notas: null, fechaEntrega: "2026-07-10T00:00:00.000Z", cuentaEntrega: account, saldoPendiente: 60_000, devoluciones: [{ id: "repayment-1", monto: 40_000, fecha: "2026-07-12T00:00:00.000Z", notas: "Gracias", cuentaDestino: account }] },
  { id: "loan-2", persona: "Alex", montoEntregado: 30_000, estado: "PENDIENTE", notas: null, fechaEntrega: "2026-07-11T00:00:00.000Z", cuentaEntrega: account, saldoPendiente: 30_000, devoluciones: [] },
  { id: "loan-3", persona: "Sam", montoEntregado: 20_000, estado: "SALDADO", notas: null, fechaEntrega: "2026-06-01T00:00:00.000Z", cuentaEntrega: account, saldoPendiente: 0, devoluciones: [] },
] as const;

function response(body: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response; }
function installFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/loans" && !init?.method) return Promise.resolve(response({ loans, summary: { pendingLoansTotal: 90_000, pendingLoansCount: 2 } }));
    if (url === "/api/accounts") return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
    if (url === "/api/loans/loan-1" && !init?.method) return Promise.resolve(response({ loan: loans[0] }));
    return Promise.resolve(response({ loan: loans[0] }, 201));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("LoansPage", () => {
  it("loads the pending summary and keeps independent loans grouped under one person", async () => {
    installFetch();
    render(<LoansPage />);
    const summary = await screen.findByRole("region", { name: "Resumen por cobrar" });
    expect(within(summary).getByText("$90.000")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alex" })).toBeInTheDocument();
    expect(screen.getAllByText("$30.000").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Nuevo préstamo" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Registrar nuevo préstamo" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dash" })).not.toHaveAttribute("aria-current");
    fireEvent.click(screen.getByRole("tab", { name: /Saldados/ }));
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });

  it("shows repayment history and blocks an over-balance repayment", async () => {
    installFetch();
    render(<LoansPage />);
    await screen.findByText("Alex");
    fireEvent.click(screen.getAllByRole("button", { name: /Ver detalle/ })[0]);
    expect(await screen.findByText("Historial de devoluciones")).toBeInTheDocument();
    expect(screen.getByText("Recibido en Cuenta principal · Gracias")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Registrar devolución/ })[0]);
    const amount = screen.getByLabelText("Monto devuelto");
    fireEvent.change(amount, { target: { value: "60001" } });
    expect(screen.getByText(/No puede superar el saldo pendiente/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar devolución" })).toBeDisabled();
  });

  it("validates account balance before creating a loan and sends the real payload", async () => {
    const fetchMock = installFetch();
    render(<LoansPage initialMode="create" />);
    await screen.findByRole("heading", { name: "Nuevo préstamo" });
    expect(screen.getByText("La entrega reduce la cuenta, pero no cuenta como gasto ordinario.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Persona"), { target: { value: "Taylor" } });
    fireEvent.change(screen.getByLabelText("Monto entregado"), { target: { value: "100000" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar préstamo" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/loans", expect.objectContaining({ method: "POST", credentials: "include" })));
    const request = fetchMock.mock.calls.find(([input, init]) => String(input) === "/api/loans" && init?.method === "POST");
    const payload = JSON.parse(String(request?.[1]?.body));
    expect(payload).toMatchObject({ persona: "Taylor", montoEntregado: 100000, accountId: "account-1" });
    expect(payload).not.toHaveProperty("tipo");
    expect(payload).not.toHaveProperty("categoryId");
  });

  it("describes repayments as non-ordinary income and marks Dashboard as active", async () => {
    installFetch();
    render(<LoansPage initialMode="repay" initialLoanId="loan-1" />);
    await screen.findByRole("heading", { name: "Registrar devolución" });
    expect(screen.getByText("La devolución aumenta la cuenta destino, pero no cuenta como ingreso ordinario.")).toBeInTheDocument();
  });

  it("disables a mutation while it is pending and does not submit it twice", async () => {
    let resolveCreate!: (value: Response) => void;
    const fetchMock = installFetch();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/loans" && init?.method === "POST") {
        return new Promise<Response>((resolve) => { resolveCreate = resolve; });
      }
      if (String(input) === "/api/accounts") return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
      if (String(input) === "/api/loans") return Promise.resolve(response({ loans, summary: { pendingLoansTotal: 90_000, pendingLoansCount: 2 } }));
      return Promise.resolve(response({ loans, summary: { pendingLoansTotal: 90_000, pendingLoansCount: 2 } }));
    });

    render(<LoansPage initialMode="create" />);
    await screen.findByRole("heading", { name: "Nuevo préstamo" });
    fireEvent.change(screen.getByLabelText("Persona"), { target: { value: "Taylor" } });
    fireEvent.change(screen.getByLabelText("Monto entregado"), { target: { value: "100000" } });
    const submit = screen.getByRole("button", { name: "Registrar préstamo" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("Registrando préstamo...");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    resolveCreate(response({ loan: loans[0] }, 201));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Préstamo registrado correctamente."));
  });

  it("ignores an older out-of-order refresh response", async () => {
    const deferred: Array<(value: Response) => void> = [];
    let rejectInitial!: (reason?: unknown) => void;
    let requestCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/loans" && !init?.method) {
        requestCount += 1;
        if (requestCount === 1) return new Promise<Response>((_, reject) => { rejectInitial = reject; });
        return new Promise<Response>((resolve) => deferred.push(resolve));
      }
      return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoansPage />);
    rejectInitial(new Error("network"));
    const retry = await screen.findByRole("button", { name: "Reintentar" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    await waitFor(() => expect(deferred).toHaveLength(2));
    deferred[1](response({ loans: [{ ...loans[0], persona: "Nueva" }], summary: { pendingLoansTotal: 60_000, pendingLoansCount: 1 } }));
    deferred[0](response({ loans: [{ ...loans[0], persona: "Antigua" }], summary: { pendingLoansTotal: 50_000, pendingLoansCount: 1 } }));
    await waitFor(() => expect(screen.getByText("Nueva")).toBeInTheDocument());
    expect(screen.queryByText("Antigua")).not.toBeInTheDocument();
  });

  it("offers a real retry action after a load error", async () => {
    let rejectInitial!: (reason?: unknown) => void;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/loans" && !init?.method) {
        return new Promise<Response>((_, reject) => { rejectInitial = reject; });
      }
      return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoansPage />);
    rejectInitial(new Error("network"));
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(screen.getByText("Cargando préstamos...")).toBeInTheDocument();
  });

  it("keeps only the sticky create action in the pending empty state", async () => {
    const fetchMock = installFetch();
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/loans" && !init?.method) return Promise.resolve(response({ loans: [], summary: { pendingLoansTotal: 0, pendingLoansCount: 0 } }));
      return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
    });
    render(<LoansPage />);
    await screen.findByText("No tienes préstamos pendientes");
    expect(screen.getAllByRole("button", { name: "Nuevo préstamo" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Registrar préstamo/ })).not.toBeInTheDocument();
  });

  it("associates each status tab with its panel", async () => {
    installFetch();
    render(<LoansPage />);
    await screen.findByRole("heading", { name: "Préstamos" });
    const tab = screen.getByRole("tab", { name: /Pendientes/ });
    expect(tab).toHaveAttribute("aria-controls", "loans-panel-PENDIENTE");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "loans-panel-PENDIENTE");
  });

  it("completes a partial repayment with the real endpoint, payload, refresh, and visible balance", async () => {
    let currentLoans: Loan[] = [...loans] as unknown as Loan[];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/loans" && !init?.method) return Promise.resolve(response({ loans: currentLoans, summary: { pendingLoansTotal: currentLoans.reduce((sum, loan) => sum + loan.saldoPendiente, 0), pendingLoansCount: currentLoans.filter((loan) => loan.estado === "PENDIENTE").length } }));
      if (url === "/api/accounts") return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
      if (url === "/api/loans/loan-1/repayments") {
        currentLoans = currentLoans.map((loan) => loan.id === "loan-1" ? { ...loan, saldoPendiente: 20_000, devoluciones: [...loan.devoluciones, { id: "repayment-2", monto: 40_000, fecha: "2026-07-16T00:00:00.000Z", notas: null, cuentaDestino: account }] } : loan);
        return Promise.resolve(response({ repayment: currentLoans[0].devoluciones[1] }, 201));
      }
      return Promise.resolve(response({ loan: currentLoans[0] }, 200));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoansPage />);
    await screen.findByText("Alex");
    fireEvent.click(screen.getAllByRole("button", { name: /Registrar devolución/ })[0]);
    fireEvent.change(screen.getByLabelText("Monto devuelto"), { target: { value: "40000" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar devolución" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Devolución registrada correctamente."));
    const request = fetchMock.mock.calls.find(([input, init]) => String(input) === "/api/loans/loan-1/repayments" && init?.method === "POST");
    expect(request?.[1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(String((request?.[1] as RequestInit).body))).toMatchObject({ monto: 40000, accountId: "account-1" });
    expect(fetchMock.mock.calls.filter(([input, init]) => String(input) === "/api/loans" && !init?.method).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("$20.000").length).toBeGreaterThan(0);
  });

  it("completes an exact repayment and exposes the refreshed SALDADO state", async () => {
    let currentLoans: Loan[] = [...loans] as unknown as Loan[];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/loans" && !init?.method) return Promise.resolve(response({ loans: currentLoans, summary: { pendingLoansTotal: currentLoans.filter((loan) => loan.estado === "PENDIENTE").reduce((sum, loan) => sum + loan.saldoPendiente, 0), pendingLoansCount: currentLoans.filter((loan) => loan.estado === "PENDIENTE").length } }));
      if (url === "/api/accounts") return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
      if (url === "/api/loans/loan-2/repayments") {
        currentLoans = currentLoans.map((loan) => loan.id === "loan-2" ? { ...loan, estado: "SALDADO", saldoPendiente: 0 } : loan);
        return Promise.resolve(response({ repayment: { id: "repayment-3", monto: 30000, fecha: "2026-07-16T00:00:00.000Z", notas: null, cuentaDestino: account } }, 201));
      }
      return Promise.resolve(response({ loan: currentLoans[0] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoansPage initialMode="repay" initialLoanId="loan-2" />);
    await screen.findByRole("heading", { name: "Registrar devolución" });
    fireEvent.change(screen.getByLabelText("Monto devuelto"), { target: { value: "30000" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar devolución" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Devolución registrada correctamente."));
    expect(JSON.parse(String(fetchMock.mock.calls.find(([input, init]) => String(input).endsWith("/repayments") && init?.method === "POST")?.[1]?.body))).toMatchObject({ monto: 30000, accountId: "account-1" });
    fireEvent.click(screen.getByRole("tab", { name: /Saldados/ }));
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    expect(screen.getByText("Alex")).toBeInTheDocument();
  });

  it("edits a loan without repayments using PATCH and refreshes the visible person and amount", async () => {
    let currentLoans: Loan[] = [...loans] as unknown as Loan[];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/loans" && !init?.method) return Promise.resolve(response({ loans: currentLoans, summary: { pendingLoansTotal: 90_000, pendingLoansCount: 2 } }));
      if (url === "/api/accounts") return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
      if (url === "/api/loans/loan-2" && init?.method === "PATCH") { currentLoans = currentLoans.map((loan) => loan.id === "loan-2" ? { ...loan, persona: "Jordan", montoEntregado: 35_000, saldoPendiente: 35_000 } : loan); return Promise.resolve(response({ loan: currentLoans[1] })); }
      return Promise.resolve(response({ loan: currentLoans[0] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoansPage />);
    await screen.findByText("Alex");
    fireEvent.click(screen.getAllByRole("button", { name: /Ver detalle/ })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Persona"), { target: { value: "Jordan" } });
    fireEvent.change(screen.getByLabelText("Monto entregado"), { target: { value: "35000" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Préstamo actualizado correctamente."));
    const request = fetchMock.mock.calls.find(([input, init]) => String(input) === "/api/loans/loan-2" && init?.method === "PATCH");
    expect(request?.[1]).toMatchObject({ method: "PATCH", credentials: "include" });
    expect(JSON.parse(String((request?.[1] as RequestInit).body))).toMatchObject({ persona: "Jordan", montoEntregado: 35000, accountId: "account-1" });
    expect(screen.getByText("Jordan")).toBeInTheDocument();
    expect(screen.getAllByText("$35.000").length).toBeGreaterThan(0);
  });

  it("annuls a loan without repayments using DELETE and removes it after refresh", async () => {
    let currentLoans: Loan[] = [...loans] as unknown as Loan[];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/loans" && !init?.method) return Promise.resolve(response({ loans: currentLoans, summary: { pendingLoansTotal: 90_000, pendingLoansCount: 2 } }));
      if (url === "/api/accounts") return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
      if (url === "/api/loans/loan-2" && init?.method === "DELETE") { currentLoans = currentLoans.filter((loan) => loan.id !== "loan-2"); return Promise.resolve(response(undefined, 204)); }
      return Promise.resolve(response({ loan: currentLoans[0] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<LoansPage />);
    await screen.findByText("Alex");
    fireEvent.click(screen.getAllByRole("button", { name: /Ver detalle/ })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Anular" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Préstamo anulado correctamente."));
    expect(fetchMock).toHaveBeenCalledWith("/api/loans/loan-2", expect.objectContaining({ method: "DELETE", credentials: "include" }));
    expect(screen.queryByText("$30.000")).not.toBeInTheDocument();
  });

  it("moves a loan between INCOBRABLE and PENDIENTE with status PATCH requests and refreshed tabs", async () => {
    let currentLoans: Loan[] = [...loans] as unknown as Loan[];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/loans" && !init?.method) return Promise.resolve(response({ loans: currentLoans, summary: { pendingLoansTotal: currentLoans.filter((loan) => loan.estado === "PENDIENTE").reduce((sum, loan) => sum + loan.saldoPendiente, 0), pendingLoansCount: currentLoans.filter((loan) => loan.estado === "PENDIENTE").length } }));
      if (url === "/api/accounts") return Promise.resolve(response({ groups: [{ accounts: [account] }], inactive: [] }));
      if (url === "/api/loans/loan-2/status" && init?.method === "PATCH") { const body = JSON.parse(String(init.body)); currentLoans = currentLoans.map((loan) => loan.id === "loan-2" ? { ...loan, estado: body.estado } : loan); return Promise.resolve(response({ loan: currentLoans[1] })); }
      return Promise.resolve(response({ loan: currentLoans[0] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<LoansPage />);
    await screen.findByText("Alex");
    fireEvent.click(screen.getAllByRole("button", { name: /Ver detalle/ })[1]);
    fireEvent.click(screen.getByRole("button", { name: /Marcar.*incobrable/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Estado actualizado correctamente."));
    fireEvent.click(screen.getByRole("tab", { name: /Incobrables/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ver detalle/ }));
    expect(screen.getByText("Incobrable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Volver.*pendiente/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Estado actualizado correctamente."));
    expect(fetchMock.mock.calls.filter(([input, init]) => String(input) === "/api/loans/loan-2/status" && init?.method === "PATCH")).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: /Pendientes/ }));
    expect(screen.getByText("Alex")).toBeInTheDocument();
  });
});
