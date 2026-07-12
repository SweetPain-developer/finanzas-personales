import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { MovementsPage } from "./MovementsPage";
import type { DashboardData } from "./dashboardTypes";
import type { MovementsData } from "./movementTypes";

const dashboardData: DashboardData = {
  currentMonthLabel: "Julio 2026",
  availableToSpend: 345000,
  liquidNetWorth: 1250000,
  liquidNetWorthVariation: 50000,
  monthlyIncome: 1200000,
  monthlyExpenses: 855000,
  goals: [],
  recentTransactions: [],
};

const movementsData: MovementsData = {
  currentMonth: "2026-07",
  filters: {
    accounts: [
      { id: "account-demo-primary", nombre: "Cuenta Demo Principal" },
      { id: "account-demo-wallet", nombre: "Billetera Demo" },
      { id: "account-demo-secondary", nombre: "Cuenta Demo Secundaria" },
    ],
    categories: [
      { id: "category-delivery", nombre: "Delivery", icono: "delivery", tipo: "GASTO" },
      { id: "category-salary", nombre: "Sueldo", icono: "salary", tipo: "INGRESO" },
      { id: "category-supermarket", nombre: "Supermercado", icono: "shopping-cart", tipo: "GASTO" },
    ],
  },
  groups: [
    {
      label: "HOY",
      date: "2026-07-05",
      movements: [
        {
          id: "tx-delivery",
          tipo: "GASTO",
          monto: 8500,
          descripcion: "Delivery",
          fecha: "2026-07-05",
          account: { id: "account-demo-primary", nombre: "Cuenta Demo Principal" },
          category: { id: "category-delivery", nombre: "Delivery", icono: "delivery", tipo: "GASTO" },
        },
        {
          id: "transfer-1",
          transferId: "transfer-1",
          tipo: "TRANSFERENCIA",
          monto: 50000,
          descripcion: "Transferencia",
          fecha: "2026-07-05",
          fromAccount: { id: "account-demo-primary", nombre: "Cuenta Demo Principal" },
          toAccount: { id: "account-demo-wallet", nombre: "Billetera Demo" },
        },
        {
          id: "transfer-unique-accounts",
          transferId: "transfer-unique-accounts",
          tipo: "TRANSFERENCIA",
          monto: 10000,
          descripcion: "Traspaso interno",
          fecha: "2026-07-05",
          fromAccount: { id: "account-origin", nombre: "Cuenta Origen" },
          toAccount: { id: "account-destination", nombre: "Cuenta Destino" },
        },
        {
          id: "tx-grocery",
          tipo: "GASTO",
          monto: 32000,
          descripcion: "Compra semanal",
          fecha: "2026-07-05",
          account: { id: "account-demo-secondary", nombre: "Cuenta Demo Secundaria" },
          category: { id: "category-supermarket", nombre: "Supermercado", icono: "shopping-cart", tipo: "GASTO" },
        },
        {
          id: "tx-salary",
          tipo: "INGRESO",
          monto: 1200000,
          descripcion: "Sueldo mensual",
          fecha: "2026-07-05",
          account: { id: "account-demo-wallet", nombre: "Billetera Demo" },
          category: { id: "category-salary", nombre: "Sueldo", icono: "salary", tipo: "INGRESO" },
        },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MovementsPage", () => {
  it("opens from the dashboard bottom nav Mov item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        return Promise.resolve(jsonResponse(url.includes("movements") ? movementsData : dashboardData));
      }),
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Mov/ }));

    expect(await screen.findByRole("heading", { name: "Movimientos" })).toBeInTheDocument();
    expect(screen.getAllByText("Delivery")[0]).toBeInTheDocument();
  });

  it("renders loading while movements load", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<MovementsPage />);

    expect(screen.getByText("Cargando movimientos...")).toBeInTheDocument();
  });

  it("renders a friendly error when the movements request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ message: "Server error" }, false, 500))));

    render(<MovementsPage />);

    expect(await screen.findByText("No pudimos cargar tus movimientos. Inténtalo nuevamente en unos minutos.")).toBeInTheDocument();
    expect(screen.queryByText(/Movements request failed/i)).not.toBeInTheDocument();
  });

  it("renders successful movement data including fused transfers", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    expect(await screen.findByText("HOY")).toBeInTheDocument();
    expect(screen.getAllByText("Delivery")[0]).toBeInTheDocument();
    expect(screen.getByText("Cuenta Demo Principal → Billetera Demo")).toBeInTheDocument();
    expect(screen.getAllByText("Transferencia")[0]).toBeInTheDocument();
    expect(screen.getAllByText("-$50.000")[0]).toBeInTheDocument();
  });

  it("opens detail for a regular movement and shows key fields", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));

    const detail = screen.getByRole("region", { name: "Compra semanal" });
    expect(within(detail).getByText("Detalle del movimiento")).toBeInTheDocument();
    expect(within(detail).getByText("-$32.000")).toBeInTheDocument();
    expect(within(detail).getByText("Gasto")).toBeInTheDocument();
    expect(within(detail).getByText("05 jul 2026")).toBeInTheDocument();
    expect(within(detail).getByText("Cuenta Demo Secundaria")).toBeInTheDocument();
    expect(within(detail).getByText("Supermercado")).toBeInTheDocument();
  });

  it("opens detail for a transfer and shows origin and destination accounts", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Cuenta Demo Principal → Billetera Demo" }));

    const detail = screen.getByRole("region", { name: "Cuenta Demo Principal → Billetera Demo" });
    expect(within(detail).getAllByText("Transferencia")[0]).toBeInTheDocument();
    expect(within(detail).getByText("Cuenta origen")).toBeInTheDocument();
    expect(within(detail).getByText("Cuenta Demo Principal")).toBeInTheDocument();
    expect(within(detail).getByText("Cuenta destino")).toBeInTheDocument();
    expect(within(detail).getByText("Billetera Demo")).toBeInTheDocument();
  });

  it("closes detail and returns to the movement list", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));
    expect(screen.getByRole("region", { name: "Compra semanal" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Volver a movimientos" }));

    expect(screen.queryByRole("region", { name: "Compra semanal" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver detalle de Cuenta Demo Principal → Billetera Demo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver detalle de Compra semanal" })).toBeInTheDocument();
  });

  it("opens edit from regular movement detail, submits changes, and reloads the updated detail", async () => {
    const updatedMovementsData: MovementsData = {
      ...movementsData,
      groups: movementsData.groups.map((group) => ({
        ...group,
        movements: group.movements.map((movement) =>
          movement.id === "tx-grocery" && movement.tipo !== "TRANSFERENCIA"
            ? { ...movement, monto: 35000, descripcion: "Compra ajustada", fecha: "2026-07-06", account: { id: "account-demo-wallet", nombre: "Billetera Demo" } }
            : movement,
        ),
      })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(movementsData))
      .mockResolvedValueOnce(jsonResponse({ movement: { id: "tx-grocery" } }))
      .mockResolvedValueOnce(jsonResponse(updatedMovementsData));
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    const form = screen.getByRole("form", { name: "Editar movimiento" });
    fireEvent.change(within(form).getByLabelText("Monto"), { target: { value: "35000" } });
    fireEvent.change(within(form).getByLabelText("Fecha"), { target: { value: "2026-07-06" } });
    fireEvent.change(within(form).getByLabelText("Descripción"), { target: { value: "Compra ajustada" } });
    fireEvent.change(within(form).getByLabelText("Cuenta"), { target: { value: "account-demo-wallet" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/movements/tx-grocery",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "GASTO",
            monto: 35000,
            fecha: "2026-07-06",
            descripcion: "Compra ajustada",
            accountId: "account-demo-wallet",
            categoryId: "category-supermarket",
          }),
        }),
      ),
    );
    expect(await screen.findByText("Movimiento actualizado correctamente.")).toBeInTheDocument();
    const updatedDetail = await screen.findByRole("region", { name: "Compra ajustada" });
    expect(within(updatedDetail).getByText("-$35.000")).toBeInTheDocument();
    expect(within(updatedDetail).getByText("Billetera Demo")).toBeInTheDocument();
  });

  it("closes detail with feedback when an edited movement no longer matches the active filters", async () => {
    const accountFilteredData: MovementsData = {
      ...movementsData,
      groups: movementsData.groups.map((group) => ({
        ...group,
        movements: group.movements.filter((movement) => movement.id === "tx-grocery"),
      })),
    };
    const filteredAfterUpdateData: MovementsData = {
      ...accountFilteredData,
      groups: accountFilteredData.groups.map((group) => ({ ...group, movements: [] })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(movementsData))
      .mockResolvedValueOnce(jsonResponse(accountFilteredData))
      .mockResolvedValueOnce(jsonResponse({ movement: { id: "tx-grocery" } }))
      .mockResolvedValueOnce(jsonResponse(filteredAfterUpdateData));
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementsPage />);

    await screen.findByText("HOY");
    fireEvent.change(screen.getByLabelText("Cuenta"), { target: { value: "account-demo-secondary" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/movements?month=2026-07&accountId=account-demo-secondary", expect.any(Object)));
    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    const form = screen.getByRole("form", { name: "Editar movimiento" });
    fireEvent.change(within(form).getByLabelText("Cuenta"), { target: { value: "account-demo-wallet" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Movimiento actualizado, pero ya no coincide con los filtros actuales.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Compra semanal" })).not.toBeInTheDocument();
  });

  it("opens transfer edit, submits changes, and reloads the updated detail", async () => {
    const updatedMovementsData: MovementsData = {
      ...movementsData,
      groups: movementsData.groups.map((group) => ({
        ...group,
        movements: group.movements.map((movement) =>
          movement.id === "transfer-1" && movement.tipo === "TRANSFERENCIA"
            ? {
                ...movement,
                monto: 75000,
                descripcion: "Ahorro actualizado",
                fecha: "2026-07-06",
                fromAccount: { id: "account-demo-secondary", nombre: "Cuenta Demo Secundaria" },
                toAccount: { id: "account-demo-wallet", nombre: "Billetera Demo" },
              }
            : movement,
        ),
      })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(movementsData))
      .mockResolvedValueOnce(jsonResponse({ movement: [] }))
      .mockResolvedValueOnce(jsonResponse(updatedMovementsData));
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Cuenta Demo Principal → Billetera Demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    const form = screen.getByRole("form", { name: "Editar transferencia" });
    fireEvent.change(within(form).getByLabelText("Monto"), { target: { value: "75000" } });
    fireEvent.change(within(form).getByLabelText("Fecha"), { target: { value: "2026-07-06" } });
    fireEvent.change(within(form).getByLabelText("Descripción"), { target: { value: "Ahorro actualizado" } });
    fireEvent.change(within(form).getByLabelText("Cuenta origen"), { target: { value: "account-demo-secondary" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/movements/transfer-1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "TRANSFERENCIA",
            monto: 75000,
            fecha: "2026-07-06",
            descripcion: "Ahorro actualizado",
            fromAccountId: "account-demo-secondary",
            toAccountId: "account-demo-wallet",
          }),
        }),
      ),
    );
    expect(await screen.findByText("Movimiento actualizado correctamente.")).toBeInTheDocument();
    const updatedDetail = await screen.findByRole("region", { name: "Cuenta Demo Secundaria → Billetera Demo" });
    expect(within(updatedDetail).getByText("-$75.000")).toBeInTheDocument();
  });

  it("validates different accounts in transfer edit before submitting", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(movementsData)));
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Cuenta Demo Principal → Billetera Demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));

    const form = screen.getByRole("form", { name: "Editar transferencia" });
    fireEvent.change(within(form).getByLabelText("Cuenta destino"), { target: { value: "account-demo-primary" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    expect(screen.getByText("La cuenta origen y destino deben ser diferentes.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/movements/transfer-1", expect.objectContaining({ method: "PATCH" }));
  });

  it("does not delete a regular movement when confirmation is cancelled", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(movementsData)));
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirmMock);

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(confirmMock).toHaveBeenCalledWith("¿Quieres eliminar este movimiento? Esta acción ajustará el saldo de la cuenta.");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/movements/tx-grocery", { method: "DELETE" });
    expect(screen.getByRole("region", { name: "Compra semanal" })).toBeInTheDocument();
  });

  it("deletes a regular movement from detail, reloads the list, and shows feedback", async () => {
    const deletedMovementsData: MovementsData = {
      ...movementsData,
      groups: movementsData.groups.map((group) => ({
        ...group,
        movements: group.movements.filter((movement) => movement.id !== "tx-grocery"),
      })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(movementsData))
      .mockResolvedValueOnce(jsonResponse(null, true, 204))
      .mockResolvedValueOnce(jsonResponse(deletedMovementsData));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/movements/tx-grocery", { method: "DELETE" }));
    expect(await screen.findByText("Movimiento eliminado correctamente.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Compra semanal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver detalle de Compra semanal" })).not.toBeInTheDocument();
  });

  it("styles the movement delete action as destructive", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));
    const styles = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "styles.css"), "utf8");

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));

    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass("app-action-button--danger");
    expect(styles).toMatch(/\.app-action-button--danger\s*\{[^}]*background:\s*#b42318;/);
  });

  it("shows Spanish feedback when movement deletion fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(movementsData))
      .mockResolvedValueOnce(jsonResponse({ error: "Movement changed while deleting. Please reload and try again." }, false, 409));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText("No pudimos eliminar el movimiento. Actualiza la información e inténtalo nuevamente.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Compra semanal" })).toBeInTheDocument();
  });

  it("cancels transfer deletion from detail without calling the API", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(movementsData));
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirmMock);

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Cuenta Demo Principal → Billetera Demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(confirmMock).toHaveBeenCalledWith(
      "¿Quieres eliminar esta transferencia entre Cuenta Demo Principal y Billetera Demo? Se revertirá el saldo: se devolverá el monto a Cuenta Demo Principal y se descontará de Billetera Demo.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Cuenta Demo Principal → Billetera Demo" })).toBeInTheDocument();
  });

  it("deletes a transfer from detail, reloads the list, and shows feedback", async () => {
    const deletedMovementsData: MovementsData = {
      ...movementsData,
      groups: movementsData.groups.map((group) => ({
        ...group,
        movements: group.movements.filter((movement) => movement.id !== "transfer-1"),
      })),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(movementsData))
      .mockResolvedValueOnce(jsonResponse(null, true, 204))
      .mockResolvedValueOnce(jsonResponse(deletedMovementsData));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Cuenta Demo Principal → Billetera Demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/movements/transfer-1", { method: "DELETE" }));
    expect(await screen.findByText("Transferencia eliminada correctamente.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Cuenta Demo Principal → Billetera Demo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver detalle de Cuenta Demo Principal → Billetera Demo" })).not.toBeInTheDocument();
  });

  it("shows Spanish feedback when transfer deletion fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(movementsData))
      .mockResolvedValueOnce(jsonResponse({ error: "Transfer pair is invalid. Please reload and try again." }, false, 409));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Cuenta Demo Principal → Billetera Demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText("No pudimos eliminar el movimiento. Actualiza la información e inténtalo nuevamente.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Cuenta Demo Principal → Billetera Demo" })).toBeInTheDocument();
  });

  it("closes detail when search text changes", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));
    expect(screen.getByRole("region", { name: "Compra semanal" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Buscar movimiento"), { target: { value: "sueldo" } });

    expect(screen.queryByRole("region", { name: "Compra semanal" })).not.toBeInTheDocument();
    expect(screen.getByText("Sueldo mensual")).toBeInTheDocument();
    expect(screen.queryByText("Compra semanal")).not.toBeInTheDocument();
  });

  it("closes detail when the period filter changes", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(movementsData)));
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle de Compra semanal" }));
    expect(screen.getByRole("region", { name: "Compra semanal" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Período"), { target: { value: "2026-06" } });

    expect(screen.queryByRole("region", { name: "Compra semanal" })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/movements?month=2026-06", expect.any(Object)));
  });

  it("filters movements by search text", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    await screen.findByText("HOY");
    fireEvent.change(screen.getByLabelText("Buscar movimiento"), { target: { value: "sueldo" } });

    expect(screen.getByText("Sueldo mensual")).toBeInTheDocument();
    expect(screen.queryByText("Cuenta Demo Principal → Billetera Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("-$8.500")).not.toBeInTheDocument();
  });

  it("filters standard movements by account name search", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    await screen.findByText("HOY");
    fireEvent.change(screen.getByLabelText("Buscar movimiento"), { target: { value: "cuenta demo secundaria" } });

    expect(screen.getByText("Compra semanal")).toBeInTheDocument();
    expect(screen.queryByText("Sueldo mensual")).not.toBeInTheDocument();
    expect(screen.queryByText("Cuenta Demo Principal → Billetera Demo")).not.toBeInTheDocument();
  });

  it("filters standard movements by category name distinct from description", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    await screen.findByText("HOY");
    fireEvent.change(screen.getByLabelText("Buscar movimiento"), { target: { value: "supermercado" } });

    expect(screen.getByText("Compra semanal")).toBeInTheDocument();
    expect(screen.queryByText("-$8.500")).not.toBeInTheDocument();
    expect(screen.queryByText("Sueldo mensual")).not.toBeInTheDocument();
  });

  it("filters transfers by origin and destination account name search", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    await screen.findByText("HOY");
    const searchInput = screen.getByLabelText("Buscar movimiento");

    fireEvent.change(searchInput, { target: { value: "cuenta origen" } });
    expect(screen.getByText("Cuenta Origen → Cuenta Destino")).toBeInTheDocument();
    expect(screen.queryByText("Cuenta Demo Principal → Billetera Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("Compra semanal")).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "cuenta destino" } });
    expect(screen.getByText("Cuenta Origen → Cuenta Destino")).toBeInTheDocument();
    expect(screen.queryByText("Cuenta Demo Principal → Billetera Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("Compra semanal")).not.toBeInTheDocument();
  });

  it("filters movements by type", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    await screen.findByText("HOY");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "TRANSFERENCIA" } });

    expect(screen.getByText("Cuenta Demo Principal → Billetera Demo")).toBeInTheDocument();
    expect(screen.queryByText("Sueldo mensual")).not.toBeInTheDocument();
    expect(screen.queryByText("-$8.500")).not.toBeInTheDocument();
  });

  it("clears active filters and restores the full view", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    await screen.findByText("HOY");
    fireEvent.change(screen.getByLabelText("Buscar movimiento"), { target: { value: "sueldo" } });
    expect(screen.queryByText("Cuenta Demo Principal → Billetera Demo")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(screen.getByLabelText("Buscar movimiento")).toHaveValue("");
    expect(screen.getByText("Cuenta Demo Principal → Billetera Demo")).toBeInTheDocument();
    expect(screen.getByText("Sueldo mensual")).toBeInTheDocument();
  });

  it("renders an empty state when filters have no results", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));

    render(<MovementsPage />);

    await screen.findByText("HOY");
    fireEvent.change(screen.getByLabelText("Buscar movimiento"), { target: { value: "sin resultados" } });

    expect(screen.getByText("No hay movimientos con estos filtros.")).toBeInTheDocument();
  });

  it("preserves quick-entry and bottom navigation actions", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(movementsData))));
    const onQuickEntry = vi.fn();
    const onNavigateDashboard = vi.fn();
    const onNavigateAccounts = vi.fn();
    const onNavigateGoals = vi.fn();
    const onNavigateCommitments = vi.fn();

    render(
      <MovementsPage
        onQuickEntry={onQuickEntry}
        onNavigateDashboard={onNavigateDashboard}
        onNavigateAccounts={onNavigateAccounts}
        onNavigateGoals={onNavigateGoals}
        onNavigateCommitments={onNavigateCommitments}
      />,
    );

    await screen.findByText("HOY");
    fireEvent.click(screen.getByRole("button", { name: "Agregar movimiento" }));
    fireEvent.click(screen.getByRole("button", { name: "Dash" }));
    fireEvent.click(screen.getByRole("button", { name: "Cta" }));
    fireEvent.click(screen.getByRole("button", { name: "Meta" }));
    fireEvent.click(screen.getByRole("button", { name: "Compr" }));

    expect(onQuickEntry).toHaveBeenCalledTimes(1);
    expect(onNavigateDashboard).toHaveBeenCalledTimes(1);
    expect(onNavigateAccounts).toHaveBeenCalledTimes(1);
    expect(onNavigateGoals).toHaveBeenCalledTimes(1);
    expect(onNavigateCommitments).toHaveBeenCalledTimes(1);
  });

  it("updates the movements API request when account, category, and month filters change", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(movementsData)));
    vi.stubGlobal("fetch", fetchMock);

    render(<MovementsPage />);

    await screen.findByText("HOY");
    fireEvent.change(screen.getByLabelText("Cuenta"), { target: { value: "account-demo-wallet" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/movements?month=2026-07&accountId=account-demo-wallet", expect.any(Object)));

    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "category-delivery" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/movements?month=2026-07&accountId=account-demo-wallet&categoryId=category-delivery",
        expect.any(Object),
      ),
    );

    fireEvent.change(screen.getByLabelText("Período"), { target: { value: "2026-06" } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/movements?month=2026-06&accountId=account-demo-wallet&categoryId=category-delivery",
        expect.any(Object),
      ),
    );
  });
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}
