import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { CommitmentsPage, TEMPLATE_NOTICE_AUTO_DISMISS_MS } from "./CommitmentsPage";
import type { AccountsData } from "./accountTypes";
import type { CommitmentTemplatesData, CommitmentsData } from "./commitmentTypes";
import type { DashboardData } from "./dashboardTypes";
import type { QuickEntryOptions } from "./QuickEntry";

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

const commitmentsData: CommitmentsData = {
  currentMonth: "2026-07",
  currentMonthLabel: "Julio 2026",
  summary: { pendingCount: 2, pendingTotal: 395_000 },
  groups: [
    {
      status: "PENDIENTE",
      label: "Pendientes",
      commitments: [
        {
          id: "commitment-rent",
          templateId: "template-rent",
          nombre: "Arriendo",
          tipo: "RECURRENTE",
          monto: 350_000,
          estado: "PENDIENTE",
          fechaVencimiento: "2026-07-05",
          dueDay: 5,
          notas: null,
          canRevertPayment: false,
        },
        {
          id: "commitment-light",
          nombre: "Luz",
          tipo: "VARIABLE",
          monto: 45_000,
          estado: "PENDIENTE",
          fechaVencimiento: "2026-07-15",
          dueDay: 15,
          notas: null,
          canRevertPayment: false,
        },
      ],
    },
    {
      status: "PAGADO",
      label: "Pagados",
      commitments: [
        {
          id: "commitment-phone",
          nombre: "Plan celular",
          tipo: "RECURRENTE",
          monto: 15_000,
          estado: "PAGADO",
          fechaVencimiento: "2026-07-03",
          dueDay: 3,
          notas: null,
          canRevertPayment: true,
        },
      ],
    },
  ],
};

const accountsData: AccountsData = { groups: [], inactive: [] };

const commitmentTemplatesData: CommitmentTemplatesData = {
  templates: [
    { id: "template-rent", nombre: "Arriendo", tipo: "RECURRENTE", montoDefault: 350_000, diaVencimiento: 5, activa: true, notas: null },
    { id: "template-play", nombre: "Play", tipo: "RECURRENTE", montoDefault: 7_000, diaVencimiento: 20, activa: false, notas: "Suscripción" },
  ],
};

const quickEntryOptions: QuickEntryOptions = {
  accounts: [
    { id: "account-demo-primary", nombre: "Cuenta Demo Principal", tipo: "OPERATIVA" },
    { id: "account-demo-secondary", nombre: "Cuenta Demo Secundaria", tipo: "OPERATIVA" },
  ],
  categories: {
    GASTO: [
      { id: "category-delivery", nombre: "Delivery", icono: "bike" },
      { id: "category-services", nombre: "Servicios", icono: "services" },
      { id: "category-subscriptions", nombre: "Suscripciones", icono: "repeat" },
    ],
    INGRESO: [{ id: "category-salary", nombre: "Sueldo", icono: "salary" }],
  },
  lastUsedAccountId: "account-demo-primary",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CommitmentsPage", () => {
  it("opens from the dashboard bottom nav Compr item and renders commitments", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("commitments")) {
        return Promise.resolve(jsonResponse(commitmentsData));
      }

      return Promise.resolve(jsonResponse(dashboardData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Compr/ }));

    expect(await screen.findByRole("heading", { name: "Compromisos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compr/ })).toHaveClass("dashboard-nav-item--active");
    expect(screen.getByText("Julio 2026")).toBeInTheDocument();
    expect(screen.getByText("2 pendientes")).toBeInTheDocument();
    expect(screen.getByText("$395.000")).toBeInTheDocument();
    expect(screen.getByText("Arriendo")).toBeInTheDocument();
    expect(screen.getByText("Vence día 5")).toBeInTheDocument();
    expect(screen.getByText("Plan celular")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/commitments?month=2026-07", expect.any(Object));
  });

  it("renders loading while commitments load", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(<CommitmentsPage />);

    expect(screen.getByText("Cargando compromisos...")).toBeInTheDocument();
  });

  it("renders an error when the commitments request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ message: "Server error" }, false, 500))));

    render(<CommitmentsPage />);

    expect(await screen.findByText("No se pudieron cargar los compromisos y sus plantillas. Revisa tu conexión e inténtalo nuevamente.")).toBeInTheDocument();
  });

  it("renders an empty state when every commitment group is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            currentMonth: "2026-07",
            currentMonthLabel: "Julio 2026",
            summary: { pendingCount: 0, pendingTotal: 0 },
            groups: [
              { status: "PENDIENTE", label: "Pendientes", commitments: [] },
              { status: "PAGADO", label: "Pagados", commitments: [] },
            ],
          } satisfies CommitmentsData),
        ),
      ),
    );

    render(<CommitmentsPage />);

    expect(await screen.findByText("Sin compromisos este mes.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pendientes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pagados" })).not.toBeInTheDocument();
  });

  it("navigates between months and reloads commitments for the selected month", async () => {
    const augustData: CommitmentsData = {
      currentMonth: "2026-08",
      currentMonthLabel: "Agosto 2026",
      summary: { pendingCount: 1, pendingTotal: 70_000 },
      groups: [
        {
          status: "PENDIENTE",
          label: "Pendientes",
          commitments: [{ ...commitmentsData.groups[0]!.commitments[1]!, id: "commitment-august", nombre: "Internet", monto: 70_000, fechaVencimiento: "2026-08-12", dueDay: 12 }],
        },
        { status: "PAGADO", label: "Pagados", commitments: [] },
      ],
    };
    const juneData: CommitmentsData = {
      currentMonth: "2026-06",
      currentMonthLabel: "Junio 2026",
      summary: { pendingCount: 0, pendingTotal: 0 },
      groups: [
        { status: "PENDIENTE", label: "Pendientes", commitments: [] },
        { status: "PAGADO", label: "Pagados", commitments: [] },
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/commitments?month=2026-08") {
        return Promise.resolve(jsonResponse(augustData));
      }

      if (url === "/api/commitments?month=2026-06") {
        return Promise.resolve(jsonResponse(juneData));
      }

      if (url === "/api/commitment-templates") {
        return Promise.resolve(jsonResponse(commitmentTemplatesData));
      }

      return Promise.resolve(jsonResponse(commitmentsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    expect(await screen.findByRole("button", { name: "Editar Arriendo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/commitments?month=2026-08", expect.any(Object)));
    expect(await screen.findByText("Agosto 2026")).toBeInTheDocument();
    expect(screen.getByText("Internet")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-06" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/commitments?month=2026-06", expect.any(Object)));
    expect(await screen.findByText("Sin compromisos este mes.")).toBeInTheDocument();
  });

  it("displays recurrent templates with active and inactive status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    expect(await screen.findByRole("region", { name: "Plantillas recurrentes" })).toBeInTheDocument();
    expect(screen.getAllByText("Arriendo")).toHaveLength(2);
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Play")).toBeInTheDocument();
    expect(screen.getByText("Inactiva")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar plantilla recurrente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar compromiso" })).toHaveTextContent("Agregar compromiso");
    expect(screen.queryByText("Agregar")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar Arriendo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activar Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar plantilla Play" })).toBeInTheDocument();
    expect(screen.getByText(/Desactivar evita compromisos futuros/)).toHaveTextContent(
      "Desactivar evita compromisos futuros. Si ya generó compromisos, la plantilla se conserva para no romper el historial. Eliminar se usará solo en casos seguros.",
    );
  });

  it("toggles a recurrent template and refreshes templates without changing commitment flows", async () => {
    const updatedTemplatesData: CommitmentTemplatesData = {
      templates: commitmentTemplatesData.templates.map((template) =>
        template.id === "template-rent" ? { ...template, activa: false } : template,
      ),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: updatedTemplatesData.templates[0] }))
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(updatedTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Pausar Arriendo" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitment-templates/template-rent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: false }),
      }),
    );
    expect(await screen.findByRole("button", { name: "Activar Arriendo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar pagado Arriendo" })).toBeInTheDocument();
  });

  it("shows a Spanish error when toggling a recurrent template fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "Server error" }, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Pausar Arriendo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo actualizar la plantilla recurrente.");
  });

  it("confirms, deletes a recurrent template, and refreshes templates", async () => {
    const deletedTemplatesData: CommitmentTemplatesData = {
      templates: [commitmentTemplatesData.templates[0]!],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(emptyResponse(204))
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(deletedTemplatesData));
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirmMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar plantilla Play" }));

    expect(confirmMock).toHaveBeenCalledWith("¿Eliminar la plantilla recurrente Play?");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitment-templates/template-play", {
        method: "DELETE",
      }),
    );
    expect(await screen.findByRole("button", { name: "Pausar Arriendo" })).toBeInTheDocument();
    expect(screen.queryByText("Play")).not.toBeInTheDocument();
  });

  it("does not delete a recurrent template when confirmation is cancelled", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(commitmentsData)).mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirmMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar plantilla Play" }));

    expect(confirmMock).toHaveBeenCalledWith("¿Eliminar la plantilla recurrente Play?");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Play")).toBeInTheDocument();
  });

  it("shows a Spanish error when deleting a recurrent template that generated commitments is blocked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "Commitment template has generated commitments." }, false, 409));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar plantilla Arriendo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta plantilla ya generó compromisos. No se puede eliminar sin afectar el historial. Déjala inactiva para que no genere compromisos futuros.",
    );
    expect(screen.getByRole("button", { name: "Pausar Arriendo" })).toBeInTheDocument();
  });

  it("shows a Spanish template error when refresh fails after toggling a recurrent template", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: { ...commitmentTemplatesData.templates[0], activa: false } }))
      .mockResolvedValueOnce(jsonResponse({ error: "Server error" }, false, 500))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Pausar Arriendo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La plantilla se actualizó, pero no se pudieron recargar los compromisos.");
    expect(screen.queryByText("Commitments request failed with status 500.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pausar Arriendo" })).toBeInTheDocument();
  });

  it("opens the create recurrent template form, submits, and refreshes templates", async () => {
    const createdTemplatesData: CommitmentTemplatesData = {
      templates: [
        ...commitmentTemplatesData.templates,
        { id: "template-internet", nombre: "Internet", tipo: "RECURRENTE", montoDefault: 29_990, diaVencimiento: 12, activa: true, notas: "Fibra hogar" },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: createdTemplatesData.templates[2] }, true, 201))
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(createdTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar plantilla recurrente" }));
    const form = await screen.findByRole("region", { name: "Nueva plantilla recurrente" });
    expect(screen.queryByRole("button", { name: "Agregar movimiento" })).not.toBeInTheDocument();
    const templatesRegion = screen.getByRole("region", { name: "Plantillas recurrentes" });
    expect(templatesRegion).toContainElement(form);
    expect(templatesRegion.querySelector(".commitments-list")?.firstElementChild).toBe(form);
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Internet" } });
    fireEvent.change(within(form).getByLabelText("Monto base"), { target: { value: "29990" } });
    expect(within(form).getByLabelText("Día de vencimiento (opcional)")).toHaveValue("");
    expect(within(form).getByRole("option", { name: "Sin día fijo" })).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("Día de vencimiento (opcional)"), { target: { value: "12" } });
    fireEvent.change(within(form).getByLabelText("Notas"), { target: { value: "Fibra hogar" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar plantilla" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitment-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Internet", tipo: "RECURRENTE", montoDefault: 29_990, diaVencimiento: 12, activa: true, notas: "Fibra hogar" }),
      }),
    );
    expect(await screen.findByText("Internet")).toBeInTheDocument();
    expect(screen.getByText("Genera desde el próximo mes · vence día 12")).toBeInTheDocument();
  });

  it("shows a Spanish form error when refresh fails after creating a recurrent template", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: { id: "template-internet", nombre: "Internet", tipo: "RECURRENTE", montoDefault: 29_990, diaVencimiento: 12, activa: true, notas: "Fibra hogar" } }, true, 201))
      .mockResolvedValueOnce(jsonResponse({ error: "Server error" }, false, 500))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar plantilla recurrente" }));
    const form = await screen.findByRole("region", { name: "Nueva plantilla recurrente" });
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Internet" } });
    fireEvent.change(within(form).getByLabelText("Monto base"), { target: { value: "29990" } });
    fireEvent.change(within(form).getByLabelText("Día de vencimiento (opcional)"), { target: { value: "12" } });
    fireEvent.change(within(form).getByLabelText("Notas"), { target: { value: "Fibra hogar" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar plantilla" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/commitment-templates", expect.any(Object)));
    expect(await within(await screen.findByRole("region", { name: "Nueva plantilla recurrente" })).findByRole("alert")).toHaveTextContent("La plantilla se creó, pero no se pudieron recargar los compromisos.");
    expect(screen.queryByText("Commitments request failed with status 500.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar plantilla" })).toBeInTheDocument();
  });

  it("opens the edit recurrent template form prefilled, submits, and keeps toggle working", async () => {
    const updatedTemplatesData: CommitmentTemplatesData = {
      templates: commitmentTemplatesData.templates.map((template) =>
        template.id === "template-play" ? { ...template, nombre: "Play Plus", montoDefault: 8_000, diaVencimiento: null, activa: true, notas: "Plan demo" } : template,
      ),
    };
    const toggledTemplatesData: CommitmentTemplatesData = {
      templates: updatedTemplatesData.templates.map((template) =>
        template.id === "template-play" ? { ...template, activa: false } : template,
      ),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: updatedTemplatesData.templates[1] }))
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(updatedTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: toggledTemplatesData.templates[1] }))
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(toggledTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar plantilla Play" }));
    const editForm = await screen.findByRole("region", { name: "Editar plantilla recurrente Play" });
    const templatesRegion = screen.getByRole("region", { name: "Plantillas recurrentes" });
    expect(templatesRegion).toContainElement(editForm);
    expect(templatesRegion.querySelector(".commitments-list")?.children[1]).toBe(editForm);
    expect(within(templatesRegion).queryByRole("button", { name: "Activar Play" })).not.toBeInTheDocument();
    expect(within(editForm).getByLabelText("Nombre")).toHaveValue("Play");
    expect(within(editForm).getByLabelText("Monto base")).toHaveValue("7000");
    expect(within(editForm).getByLabelText("Día de vencimiento (opcional)")).toHaveValue("20");
    expect(within(editForm).getByLabelText("Estado")).toHaveValue("inactiva");

    fireEvent.change(within(editForm).getByLabelText("Nombre"), { target: { value: "Play Plus" } });
    fireEvent.change(within(editForm).getByLabelText("Monto base"), { target: { value: "8000" } });
    fireEvent.change(within(editForm).getByLabelText("Día de vencimiento (opcional)"), { target: { value: "" } });
    fireEvent.change(within(editForm).getByLabelText("Notas"), { target: { value: "Plan demo" } });
    fireEvent.change(within(editForm).getByLabelText("Estado"), { target: { value: "activa" } });
    fireEvent.click(within(editForm).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitment-templates/template-play", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Play Plus", tipo: "RECURRENTE", montoDefault: 8_000, diaVencimiento: null, activa: true, notas: "Plan demo" }),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Pausar Play Plus" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/commitment-templates/template-play", expect.objectContaining({ body: JSON.stringify({ activa: false }) })));
  });

  it("shows a Spanish form error when refresh fails after editing a recurrent template", async () => {
    const updatedTemplate = { ...commitmentTemplatesData.templates[1], nombre: "Play Plus", montoDefault: 8_000, diaVencimiento: null, activa: true, notas: "Plan demo" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: updatedTemplate }))
      .mockResolvedValueOnce(jsonResponse({ error: "Server error" }, false, 500))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar plantilla Play" }));
    const editForm = await screen.findByRole("region", { name: "Editar plantilla recurrente Play" });
    fireEvent.change(within(editForm).getByLabelText("Nombre"), { target: { value: "Play Plus" } });
    fireEvent.change(within(editForm).getByLabelText("Monto base"), { target: { value: "8000" } });
    fireEvent.change(within(editForm).getByLabelText("Día de vencimiento (opcional)"), { target: { value: "" } });
    fireEvent.change(within(editForm).getByLabelText("Notas"), { target: { value: "Plan demo" } });
    fireEvent.change(within(editForm).getByLabelText("Estado"), { target: { value: "activa" } });
    fireEvent.click(within(editForm).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/commitment-templates/template-play", expect.any(Object)));
    expect(await within(await screen.findByRole("region", { name: "Editar plantilla recurrente Play Plus" })).findByRole("alert")).toHaveTextContent("La plantilla se actualizó, pero no se pudieron recargar los compromisos.");
    expect(screen.queryByText("Commitments request failed with status 500.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeInTheDocument();
  });

  it("shows a status notice when editing a recurrent template with a generated commitment for the current month", async () => {
    const currentMonthTemplateNotice = "Este cambio aplicará desde Agosto de 2026. El compromiso de Julio de 2026 ya generado no se modifica.";
    const updatedTemplatesData: CommitmentTemplatesData = {
      templates: commitmentTemplatesData.templates.map((template) =>
        template.id === "template-rent" ? { ...template, nombre: "Arriendo reajustado", montoDefault: 365_000 } : template,
      ),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: updatedTemplatesData.templates[0] }))
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(updatedTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar plantilla Arriendo" }));
    const editForm = await screen.findByRole("region", { name: "Editar plantilla recurrente Arriendo" });
    fireEvent.change(within(editForm).getByLabelText("Nombre"), { target: { value: "Arriendo reajustado" } });
    fireEvent.change(within(editForm).getByLabelText("Monto base"), { target: { value: "365000" } });
    vi.useFakeTimers();
    fireEvent.click(within(editForm).getByRole("button", { name: "Guardar cambios" }));

    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByRole("status")).toHaveTextContent(currentMonthTemplateNotice);

    act(() => {
      vi.advanceTimersByTime(TEMPLATE_NOTICE_AUTO_DISMISS_MS);
    });

    expect(screen.queryByText(currentMonthTemplateNotice)).not.toBeInTheDocument();
  });

  it("keeps a non-notice error visible when the template status notice auto-dismisses", async () => {
    const currentMonthTemplateNotice = "Este cambio aplicará desde Agosto de 2026. El compromiso de Julio de 2026 ya generado no se modifica.";
    const existingError = "No se puede eliminar un compromiso pagado.";
    const updatedTemplatesData: CommitmentTemplatesData = {
      templates: commitmentTemplatesData.templates.map((template) =>
        template.id === "template-rent" ? { ...template, nombre: "Arriendo reajustado", montoDefault: 365_000 } : template,
      ),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: updatedTemplatesData.templates[0] }))
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(updatedTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "Paid commitments cannot be deleted." }, false, 409));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar plantilla Arriendo" }));
    const editForm = await screen.findByRole("region", { name: "Editar plantilla recurrente Arriendo" });
    fireEvent.change(within(editForm).getByLabelText("Nombre"), { target: { value: "Arriendo reajustado" } });
    fireEvent.change(within(editForm).getByLabelText("Monto base"), { target: { value: "365000" } });
    vi.useFakeTimers();
    fireEvent.click(within(editForm).getByRole("button", { name: "Guardar cambios" }));

    await act(async () => {
      await flushPromises();
    });

    expect(screen.getByRole("status")).toHaveTextContent(currentMonthTemplateNotice);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Luz" }));
    await act(async () => {
      await flushPromises();
    });
    expect(screen.getByText(existingError)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(TEMPLATE_NOTICE_AUTO_DISMISS_MS);
    });

    expect(screen.queryByText(currentMonthTemplateNotice)).not.toBeInTheDocument();
    expect(screen.getByText(existingError)).toBeInTheDocument();
  });

  it("does not show a status notice when editing a recurrent template without a generated current-month commitment", async () => {
    const updatedTemplatesData: CommitmentTemplatesData = {
      templates: commitmentTemplatesData.templates.map((template) =>
        template.id === "template-play" ? { ...template, nombre: "Play Plus", montoDefault: 8_000 } : template,
      ),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ template: updatedTemplatesData.templates[1] }))
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(updatedTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar plantilla Play" }));
    const editForm = await screen.findByRole("region", { name: "Editar plantilla recurrente Play" });
    fireEvent.change(within(editForm).getByLabelText("Nombre"), { target: { value: "Play Plus" } });
    fireEvent.change(within(editForm).getByLabelText("Monto base"), { target: { value: "8000" } });
    fireEvent.click(within(editForm).getByRole("button", { name: "Guardar cambios" }));

    await screen.findByRole("button", { name: "Activar Play Plus" });
    expect(screen.queryByText(/Este cambio aplicará desde/)).not.toBeInTheDocument();
  });

  it("shows a validation error when recurrent template creation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "montoDefault must be an integer greater than zero." }, false, 400));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar plantilla recurrente" }));
    const form = await screen.findByRole("region", { name: "Nueva plantilla recurrente" });
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Internet" } });
    fireEvent.change(within(form).getByLabelText("Monto base"), { target: { value: "0" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar plantilla" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El monto base debe ser mayor que cero.");
  });

  it("shows a validation error when recurrent template editing fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "diaVencimiento must be an integer between 1 and 31 or null." }, false, 400));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar plantilla Play" }));
    const editForm = await screen.findByRole("region", { name: "Editar plantilla recurrente Play" });
    fireEvent.click(within(editForm).getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El día de vencimiento debe estar entre 1 y 31, o quedar vacío.");
  });

  it("opens a confirmation flow, sends selected account/category, and refreshes the list", async () => {
    const paidCommitmentsData: CommitmentsData = {
      ...commitmentsData,
      summary: { pendingCount: 1, pendingTotal: 45_000 },
      groups: [
        {
          status: "PENDIENTE",
          label: "Pendientes",
          commitments: [commitmentsData.groups[0]!.commitments[1]!],
        },
        {
          status: "PAGADO",
          label: "Pagados",
          commitments: [commitmentsData.groups[1]!.commitments[0]!, { ...commitmentsData.groups[0]!.commitments[0]!, estado: "PAGADO" }],
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse(quickEntryOptions))
      .mockResolvedValueOnce(jsonResponse({ commitment: { id: "commitment-rent", estado: "PAGADO" } }))
      .mockResolvedValueOnce(jsonResponse(paidCommitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Marcar pagado Arriendo" }));

    expect(await screen.findByRole("region", { name: "Confirmar pago Arriendo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar movimiento" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cuenta")).toHaveValue("account-demo-primary");
    expect(screen.getByLabelText("Categoría")).toHaveValue("category-services");

    fireEvent.change(screen.getByLabelText("Cuenta"), { target: { value: "account-demo-secondary" } });
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "category-delivery" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar pago" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitments/commitment-rent/pay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: "account-demo-secondary", categoryId: "category-delivery" }),
      }),
    );
    expect(await screen.findByText("1 pendientes")).toBeInTheDocument();
    expect(screen.getAllByText("$45.000")).toHaveLength(2);
    expect(screen.getAllByText("Pagado")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Marcar pagado Arriendo" })).not.toBeInTheDocument();
  });

  it("renders an error when marking a commitment paid fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse(quickEntryOptions))
      .mockResolvedValueOnce(jsonResponse({ error: "Server error" }, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Marcar pagado Arriendo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar pago" }));

    expect(await screen.findByText("No se pudo marcar el compromiso como pagado.")).toBeInTheDocument();
  });

  it("marks a paid commitment pending and refreshes the list", async () => {
    const revertedCommitmentsData: CommitmentsData = {
      ...commitmentsData,
      summary: { pendingCount: 3, pendingTotal: 410_000 },
      groups: [
        {
          status: "PENDIENTE",
          label: "Pendientes",
          commitments: [...commitmentsData.groups[0]!.commitments, { ...commitmentsData.groups[1]!.commitments[0]!, estado: "PENDIENTE" }],
        },
        { status: "PAGADO", label: "Pagados", commitments: [] },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ commitment: { id: "commitment-phone", estado: "PENDIENTE" } }))
      .mockResolvedValueOnce(jsonResponse(revertedCommitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Marcar pendiente Plan celular" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/commitments/commitment-phone/unpay", { method: "PATCH" }));
    expect(await screen.findByText("3 pendientes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar pendiente Plan celular" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marcar pagado Plan celular" })).toBeInTheDocument();
  });

  it("does not offer the pending action for paid commitments that cannot be safely reverted", async () => {
    const legacyPaidData: CommitmentsData = {
      ...commitmentsData,
      groups: [
        commitmentsData.groups[0]!,
        {
          status: "PAGADO",
          label: "Pagados",
          commitments: [{ ...commitmentsData.groups[1]!.commitments[0]!, canRevertPayment: false }],
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(legacyPaidData)).mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    expect(await screen.findByText("Plan celular")).toBeInTheDocument();
    expect(screen.getAllByText("Pagado")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Marcar pendiente Plan celular" })).not.toBeInTheDocument();
  });

  it("renders an error when reverting a paid commitment fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "Linked payment transaction not found." }, false, 409));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Marcar pendiente Plan celular" }));

    expect(await screen.findByText("No se pudo revertir el pago del compromiso.")).toBeInTheDocument();
  });

  it("shows an error when payment options cannot load", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "Server error" }, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Marcar pagado Arriendo" }));

    expect(await screen.findByText("No se pudieron cargar las opciones de pago.")).toBeInTheDocument();
  });

  it("opens quick entry from the commitments FAB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("commitments")) {
          return Promise.resolve(jsonResponse(commitmentsData));
        }

        if (url.includes("accounts")) {
          return Promise.resolve(jsonResponse(accountsData));
        }

        if (url.includes("quick-entry")) {
          return Promise.resolve(jsonResponse(quickEntryOptions));
        }

        return Promise.resolve(jsonResponse(dashboardData));
      }),
    );

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /Compr/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Agregar movimiento" }));

    expect(await screen.findByRole("button", { name: "Guardar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Monto")).toBeInTheDocument();
  });

  it("opens the create commitment form, submits a valid commitment, and refreshes the list", async () => {
    const createdCommitmentsData: CommitmentsData = {
      ...commitmentsData,
      summary: { pendingCount: 3, pendingTotal: 424_990 },
      groups: [
        {
          ...commitmentsData.groups[0]!,
          commitments: [
            ...commitmentsData.groups[0]!.commitments,
            {
              id: "commitment-internet",
              nombre: "Internet",
              tipo: "RECURRENTE",
              monto: 29_990,
              estado: "PENDIENTE",
              fechaVencimiento: "2026-07-12",
              dueDay: 12,
              notas: "Fibra hogar",
              canRevertPayment: false,
            },
          ],
        },
        commitmentsData.groups[1]!,
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ commitment: { id: "commitment-internet" } }, true, 201))
      .mockResolvedValueOnce(jsonResponse(createdCommitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar compromiso" }));
    expect(screen.queryByRole("button", { name: "Agregar movimiento" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Internet" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "RECURRENTE" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "29990" } });
    fireEvent.change(screen.getByLabelText("Fecha de vencimiento"), { target: { value: "2026-07-12" } });
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Fibra hogar" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar compromiso" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: "Internet",
          tipo: "RECURRENTE",
          monto: 29_990,
          month: "2026-07",
          fechaVencimiento: "2026-07-12",
          notas: "Fibra hogar",
        }),
      }),
    );
    expect(await screen.findByText("3 pendientes")).toBeInTheDocument();
    expect(screen.getByText("Internet")).toBeInTheDocument();
    expect(screen.getByText("Vence día 12")).toBeInTheDocument();
  });

  it("creates a commitment for the selected month", async () => {
    const augustData: CommitmentsData = { ...commitmentsData, currentMonth: "2026-08", currentMonthLabel: "Agosto 2026", groups: [{ ...commitmentsData.groups[0]!, commitments: [] }, commitmentsData.groups[1]!] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse(augustData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ commitment: { id: "commitment-august" } }, true, 201))
      .mockResolvedValueOnce(jsonResponse(augustData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    await screen.findByText("Julio 2026");
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await screen.findByText("Agosto 2026");
    fireEvent.click(screen.getByRole("button", { name: "Agregar compromiso" }));
    expect(screen.getByLabelText("Fecha de vencimiento")).toHaveValue("2026-08-01");
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Internet" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "29990" } });
    fireEvent.change(screen.getByLabelText("Fecha de vencimiento"), { target: { value: "2026-08-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar compromiso" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitments", expect.objectContaining({
        body: JSON.stringify({ nombre: "Internet", tipo: "RECURRENTE", monto: 29_990, month: "2026-08", fechaVencimiento: "2026-08-12" }),
      })),
    );
  });

  it("keeps the latest selected month when create refresh finishes after month navigation", async () => {
    const augustData: CommitmentsData = {
      currentMonth: "2026-08",
      currentMonthLabel: "Agosto 2026",
      summary: { pendingCount: 1, pendingTotal: 70_000 },
      groups: [
        {
          status: "PENDIENTE",
          label: "Pendientes",
          commitments: [{ ...commitmentsData.groups[0]!.commitments[1]!, id: "commitment-august", nombre: "Internet", monto: 70_000, fechaVencimiento: "2026-08-12", dueDay: 12 }],
        },
        { status: "PAGADO", label: "Pagados", commitments: [] },
      ],
    };
    const createResponse = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/commitments" && init?.method === "POST") {
        return createResponse.promise;
      }

      if (url === "/api/commitments?month=2026-08") {
        return Promise.resolve(jsonResponse(augustData));
      }

      if (url === "/api/commitment-templates") {
        return Promise.resolve(jsonResponse(commitmentTemplatesData));
      }

      return Promise.resolve(jsonResponse(commitmentsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar compromiso" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Internet" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "29990" } });
    fireEvent.change(screen.getByLabelText("Fecha de vencimiento"), { target: { value: "2026-07-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar compromiso" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/commitments", expect.any(Object)));
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(await screen.findByText("Agosto 2026")).toBeInTheDocument();

    createResponse.resolve(jsonResponse({ commitment: { id: "commitment-internet" } }, true, 201));

    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/commitments?month=2026-08")).toHaveLength(2));
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/commitments?month=2026-07")).toHaveLength(1);
    expect(screen.getByText("Agosto 2026")).toBeInTheDocument();
    expect(screen.getByText("Internet")).toBeInTheDocument();
  });

  it("does not restore stale create failure state after month navigation", async () => {
    const augustData: CommitmentsData = {
      currentMonth: "2026-08",
      currentMonthLabel: "Agosto 2026",
      summary: { pendingCount: 1, pendingTotal: 70_000 },
      groups: [
        {
          status: "PENDIENTE",
          label: "Pendientes",
          commitments: [{ ...commitmentsData.groups[0]!.commitments[1]!, id: "commitment-august", nombre: "Internet", monto: 70_000, fechaVencimiento: "2026-08-12", dueDay: 12 }],
        },
        { status: "PAGADO", label: "Pagados", commitments: [] },
      ],
    };
    const createResponse = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/commitments" && init?.method === "POST") {
        return createResponse.promise;
      }

      if (url === "/api/commitments?month=2026-08") {
        return Promise.resolve(jsonResponse(augustData));
      }

      if (url === "/api/commitment-templates") {
        return Promise.resolve(jsonResponse(commitmentTemplatesData));
      }

      return Promise.resolve(jsonResponse(commitmentsData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar compromiso" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Internet" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Fecha de vencimiento"), { target: { value: "2026-07-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar compromiso" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/commitments", expect.any(Object)));
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(await screen.findByText("Agosto 2026")).toBeInTheDocument();

    createResponse.resolve(jsonResponse({ error: "Amount must be an integer greater than zero." }, false, 400));
    await Promise.resolve();

    await waitFor(() => expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/commitments?month=2026-08")).toHaveLength(1));
    expect(screen.getByText("Agosto 2026")).toBeInTheDocument();
    expect(screen.getByText("Internet")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Nuevo compromiso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Julio 2026")).not.toBeInTheDocument();
  });

  it("shows a validation error when commitment creation fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "Amount must be an integer greater than zero." }, false, 400));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Agregar compromiso" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Internet" } });
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Fecha de vencimiento"), { target: { value: "2026-07-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar compromiso" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El monto debe ser mayor que cero.");
  });

  it("opens the edit commitment form with prefilled values, submits changes, and refreshes the list", async () => {
    const updatedCommitmentsData: CommitmentsData = {
      ...commitmentsData,
      summary: { pendingCount: 2, pendingTotal: 402_000 },
      groups: [
        {
          ...commitmentsData.groups[0]!,
          commitments: [
            commitmentsData.groups[0]!.commitments[0]!,
            {
              ...commitmentsData.groups[0]!.commitments[1]!,
              nombre: "Luz casa",
              monto: 52_000,
              fechaVencimiento: "2026-07-18",
              dueDay: 18,
              notas: "Boleta ajustada",
            },
          ],
        },
        commitmentsData.groups[1]!,
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ commitment: { id: "commitment-light" } }))
      .mockResolvedValueOnce(jsonResponse(updatedCommitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar Luz" }));

    const editForm = await screen.findByRole("region", { name: "Editar compromiso Luz" });
    expect(within(editForm).getByLabelText("Nombre")).toHaveValue("Luz");
    expect(within(editForm).getByLabelText("Tipo")).toHaveValue("VARIABLE");
    expect(within(editForm).getByLabelText("Monto")).toHaveValue("45000");
    expect(within(editForm).getByLabelText("Fecha de vencimiento")).toHaveValue("2026-07-15");

    fireEvent.change(within(editForm).getByLabelText("Nombre"), { target: { value: "Luz casa" } });
    fireEvent.change(within(editForm).getByLabelText("Monto"), { target: { value: "52000" } });
    fireEvent.change(within(editForm).getByLabelText("Fecha de vencimiento"), { target: { value: "2026-07-18" } });
    fireEvent.change(within(editForm).getByLabelText("Notas"), { target: { value: "Boleta ajustada" } });
    fireEvent.click(within(editForm).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitments/commitment-light", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: "Luz casa",
          tipo: "VARIABLE",
          monto: 52_000,
          month: "2026-07",
          fechaVencimiento: "2026-07-18",
          notas: "Boleta ajustada",
        }),
      }),
    );
    expect(await screen.findByText("$402.000")).toBeInTheDocument();
    expect(screen.getByText("Luz casa")).toBeInTheDocument();
    expect(screen.getByText("Vence día 18")).toBeInTheDocument();
  });

  it("edits a commitment using the selected month", async () => {
    const augustData: CommitmentsData = {
      currentMonth: "2026-08",
      currentMonthLabel: "Agosto 2026",
      summary: { pendingCount: 1, pendingTotal: 45_000 },
      groups: [
        { ...commitmentsData.groups[0]!, commitments: [{ ...commitmentsData.groups[0]!.commitments[1]!, fechaVencimiento: "2026-08-15" }] },
        { status: "PAGADO", label: "Pagados", commitments: [] },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse(augustData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ commitment: { id: "commitment-light" } }))
      .mockResolvedValueOnce(jsonResponse(augustData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    await screen.findByText("Julio 2026");
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await screen.findByText("Agosto 2026");
    fireEvent.click(screen.getByRole("button", { name: "Editar Luz" }));
    const editForm = await screen.findByRole("region", { name: "Editar compromiso Luz" });
    fireEvent.change(within(editForm).getByLabelText("Fecha de vencimiento"), { target: { value: "2026-08-18" } });
    fireEvent.click(within(editForm).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitments/commitment-light", expect.objectContaining({
        body: JSON.stringify({ nombre: "Luz", tipo: "VARIABLE", monto: 45_000, month: "2026-08", fechaVencimiento: "2026-08-18" }),
      })),
    );
  });

  it("does not show the edit action for paid commitments while pending commitments remain editable", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(commitmentsData))));

    render(<CommitmentsPage />);

    expect(await screen.findByRole("button", { name: "Editar Arriendo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Luz" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar Plan celular" })).not.toBeInTheDocument();
  });

  it("confirms, deletes a pending commitment, and refreshes the list", async () => {
    const deletedCommitmentsData: CommitmentsData = {
      ...commitmentsData,
      summary: { pendingCount: 1, pendingTotal: 350_000 },
      groups: [
        {
          ...commitmentsData.groups[0]!,
          commitments: [commitmentsData.groups[0]!.commitments[0]!],
        },
        commitmentsData.groups[1]!,
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(emptyResponse(204))
      .mockResolvedValueOnce(jsonResponse(deletedCommitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirmMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Luz" }));

    expect(confirmMock).toHaveBeenCalledWith("¿Eliminar el compromiso Luz?");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/commitments/commitment-light", {
        method: "DELETE",
      }),
    );
    expect(await screen.findByText("1 pendientes")).toBeInTheDocument();
    expect(screen.queryByText("Luz")).not.toBeInTheDocument();
  });

  it("does not delete when the confirmation is cancelled", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(commitmentsData)).mockResolvedValueOnce(jsonResponse(commitmentTemplatesData));
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirmMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Luz" }));

    expect(confirmMock).toHaveBeenCalledWith("¿Eliminar el compromiso Luz?");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Luz")).toBeInTheDocument();
  });

  it("does not show the delete action for paid commitments while pending commitments can be deleted", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse(commitmentsData))));

    render(<CommitmentsPage />);

    expect(await screen.findByRole("button", { name: "Eliminar Arriendo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar Luz" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar Plan celular" })).not.toBeInTheDocument();
  });

  it("shows an error when commitment deletion fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "Paid commitments cannot be deleted." }, false, 409));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Luz" }));

    expect(await screen.findByText("No se puede eliminar un compromiso pagado.")).toBeInTheDocument();
  });

  it("shows a validation error when commitment editing fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(commitmentsData))
      .mockResolvedValueOnce(jsonResponse(commitmentTemplatesData))
      .mockResolvedValueOnce(jsonResponse({ error: "Due date must be in July 2026." }, false, 400));
    vi.stubGlobal("fetch", fetchMock);

    render(<CommitmentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Editar Luz" }));
    const editForm = await screen.findByRole("region", { name: "Editar compromiso Luz" });
    fireEvent.change(within(editForm).getByLabelText("Fecha de vencimiento"), { target: { value: "2026-08-01" } });
    fireEvent.click(within(editForm).getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La fecha de vencimiento debe ser válida y estar dentro del mes seleccionado.");
  });
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function emptyResponse(status = 204): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(null),
  } as Response;
}

async function flushPromises(times = 10) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}
