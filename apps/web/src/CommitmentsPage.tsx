import { CalendarClock, Check, ChevronLeft, ChevronRight, CreditCard, Home, Pencil, Plus, Receipt, Repeat, Target, Trash2, Wallet, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CommitmentGroup, CommitmentListItem, CommitmentTemplateListItem, CommitmentTemplatesData, CommitmentType, CommitmentsData } from "./commitmentTypes";
import type { QuickEntryOptions } from "./QuickEntry";

type CommitmentsPageState =
  | { status: "loading" }
  | { status: "success"; data: CommitmentsData; templates: CommitmentTemplateListItem[]; actionError?: string; templateError?: string; templateNotice?: string; togglingTemplateId?: string; deletingTemplateId?: string; creatingTemplate?: boolean; editingTemplateId?: string; payingCommitmentId?: string; revertingCommitmentId?: string; creatingCommitment?: boolean; editingCommitmentId?: string; deletingCommitmentId?: string }
  | { status: "error"; message: string };

type CommitmentsPageProps = {
  onQuickEntry?: () => void;
  onNavigateDashboard?: () => void;
  onNavigateMovements?: () => void;
  onNavigateAccounts?: () => void;
  onNavigateGoals?: () => void;
};

type LoadCommitmentsResult = { ok: boolean; applied: boolean };

type LoadCommitmentsOptions = {
  showLoading?: boolean;
  suppressGlobalError?: boolean;
  templateNotice?: string;
};

const INITIAL_MONTH = "2026-07";
const CREATE_COMMITMENT_ENDPOINT = "/api/commitments";
const COMMITMENT_TEMPLATES_ENDPOINT = "/api/commitment-templates";
const QUICK_ENTRY_OPTIONS_ENDPOINT = "/api/quick-entry/options";
const COMMITMENTS_LOAD_ERROR_MESSAGE = "No se pudieron cargar los compromisos y sus plantillas. Revisa tu conexión e inténtalo nuevamente.";
export const TEMPLATE_NOTICE_AUTO_DISMISS_MS = 5000;

type CreateCommitmentDraft = {
  nombre: string;
  tipo: CommitmentType;
  monto: string;
  fechaVencimiento: string;
  notas: string;
  error?: string;
};

type EditCommitmentDraft = CreateCommitmentDraft & { id: string };

type TemplateDraft = {
  nombre: string;
  tipo: CommitmentType;
  montoDefault: string;
  diaVencimiento: string;
  notas: string;
  activa: boolean;
  error?: string;
};

type EditTemplateDraft = TemplateDraft & { id: string };

type CommitmentDrafts = {
  payment: PaymentDraft | null;
  create: CreateCommitmentDraft | null;
  edit: EditCommitmentDraft | null;
};

type TemplateDrafts = {
  create: TemplateDraft | null;
  edit: EditTemplateDraft | null;
};

type CommitmentUiState = {
  isCreating: boolean;
  editingId?: string;
  deletingId?: string;
  payingId?: string;
  revertingId?: string;
};

type TemplateUiState = {
  isCreating: boolean;
  editingId?: string;
  togglingId?: string;
  deletingId?: string;
};

type CommitmentActions = {
  openCreate: () => void;
  cancelCreate: () => void;
  changeCreateDraft: (draft: CreateCommitmentDraft) => void;
  submitCreate: () => void;
  openEdit: (commitment: CommitmentListItem) => void;
  cancelEdit: () => void;
  changeEditDraft: (draft: EditCommitmentDraft) => void;
  submitEdit: () => void;
  delete: (commitment: CommitmentListItem) => void;
  markPaid: (commitment: CommitmentListItem) => void;
  markUnpaid: (commitment: CommitmentListItem) => void;
};

type PaymentActions = {
  cancel: () => void;
  changeDraft: (draft: PaymentDraft) => void;
  submit: () => void;
};

type TemplateActions = {
  toggle: (template: CommitmentTemplateListItem) => void;
  openCreate: () => void;
  cancelCreate: () => void;
  changeCreateDraft: (draft: TemplateDraft) => void;
  submitCreate: () => void;
  openEdit: (template: CommitmentTemplateListItem) => void;
  cancelEdit: () => void;
  changeEditDraft: (draft: EditTemplateDraft) => void;
  submitEdit: () => void;
  delete: (template: CommitmentTemplateListItem) => void;
};

type CommitmentsContentProps = {
  data: CommitmentsData;
  templates: CommitmentTemplateListItem[];
  actionError?: string;
  templateError?: string;
  templateNotice?: string;
  commitmentState: CommitmentUiState;
  templateState: TemplateUiState;
  commitmentDrafts: CommitmentDrafts;
  templateDrafts: TemplateDrafts;
  commitmentActions: CommitmentActions;
  paymentActions: PaymentActions;
  templateActions: TemplateActions;
  selectedMonth: string;
  selectedMonthLabel: string;
};

const EMPTY_CREATE_DRAFT: Omit<CreateCommitmentDraft, "fechaVencimiento"> = {
  nombre: "",
  tipo: "RECURRENTE",
  monto: "",
  notas: "",
};

const EMPTY_TEMPLATE_DRAFT: TemplateDraft = {
  nombre: "",
  tipo: "RECURRENTE",
  montoDefault: "",
  diaVencimiento: "",
  notas: "",
  activa: true,
};

const DUE_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => String(index + 1));

type PaymentDraft =
  | { status: "loading"; commitment: CommitmentListItem }
  | { status: "error"; commitment: CommitmentListItem; message: string }
  | {
      status: "ready";
      commitment: CommitmentListItem;
      options: QuickEntryOptions;
      accountId: string;
      categoryId: string;
      submitError?: string;
    };

export function CommitmentsPage({
  onQuickEntry,
  onNavigateDashboard,
  onNavigateMovements,
  onNavigateAccounts,
  onNavigateGoals,
}: CommitmentsPageProps) {
  const [state, setState] = useState<CommitmentsPageState>({ status: "loading" });
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateCommitmentDraft | null>(null);
  const [editDraft, setEditDraft] = useState<EditCommitmentDraft | null>(null);
  const [createTemplateDraft, setCreateTemplateDraft] = useState<TemplateDraft | null>(null);
  const [editTemplateDraft, setEditTemplateDraft] = useState<EditTemplateDraft | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(INITIAL_MONTH);
  const selectedMonthRef = useRef(INITIAL_MONTH);
  const loadRequestIdRef = useRef(0);
  const templateNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadCommitments(month = selectedMonthRef.current, signal?: AbortSignal, options: LoadCommitmentsOptions = {}): Promise<LoadCommitmentsResult> {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;

    if (options.showLoading !== false) {
      setState({ status: "loading" });
    }

    try {
      const [commitmentsResponse, templatesResponse] = await Promise.all([
        fetch(buildCommitmentsEndpoint(month), { signal }),
        fetch(COMMITMENT_TEMPLATES_ENDPOINT, { signal }),
      ]);

      if (!commitmentsResponse.ok) {
        throw new Error(`Commitments request failed with status ${commitmentsResponse.status}.`);
      }

      if (!templatesResponse.ok) {
        throw new Error(`Commitment templates request failed with status ${templatesResponse.status}.`);
      }

      const templatesData = (await templatesResponse.json()) as CommitmentTemplatesData;
      const commitmentsData = (await commitmentsResponse.json()) as CommitmentsData;

      if (requestId !== loadRequestIdRef.current || signal?.aborted) {
        return { ok: true, applied: false };
      }

      setState({
        status: "success",
        data: commitmentsData,
        templates: Array.isArray(templatesData.templates) ? templatesData.templates : [],
        templateNotice: options.templateNotice,
      });
      return { ok: true, applied: true };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { ok: false, applied: false };
      }

      if (requestId === loadRequestIdRef.current && !options.suppressGlobalError) {
        setState({ status: "error", message: COMMITMENTS_LOAD_ERROR_MESSAGE });
      }

      return { ok: false, applied: false };
    }
  }

  async function refreshCommitmentsAfterTemplateSave(templateNotice?: string) {
    const result = await loadCommitments(selectedMonthRef.current, undefined, { showLoading: false, suppressGlobalError: true, templateNotice });

    return result.ok;
  }

  useEffect(() => {
    const abortController = new AbortController();

    selectedMonthRef.current = selectedMonth;
    void loadCommitments(selectedMonth, abortController.signal);

    return () => abortController.abort();
  }, [selectedMonth]);

  useEffect(() => {
    if (templateNoticeTimerRef.current) {
      clearTimeout(templateNoticeTimerRef.current);
      templateNoticeTimerRef.current = null;
    }

    if (state.status !== "success" || !state.templateNotice) {
      return;
    }

    const notice = state.templateNotice;
    templateNoticeTimerRef.current = setTimeout(() => {
      setState((currentState) => {
        if (currentState.status !== "success" || currentState.templateNotice !== notice) {
          return currentState;
        }

        return { ...currentState, templateNotice: undefined };
      });
      templateNoticeTimerRef.current = null;
    }, TEMPLATE_NOTICE_AUTO_DISMISS_MS);

    return () => {
      if (templateNoticeTimerRef.current) {
        clearTimeout(templateNoticeTimerRef.current);
        templateNoticeTimerRef.current = null;
      }
    };
  }, [state.status, state.status === "success" ? state.templateNotice : undefined]);

  function handleSelectedMonthChange(nextMonth: string) {
    setPaymentDraft(null);
    setCreateDraft(null);
    setEditDraft(null);
    selectedMonthRef.current = nextMonth;
    setSelectedMonth(nextMonth);
  }

  function isCurrentActionMonth(actionMonth: string) {
    return selectedMonthRef.current === actionMonth;
  }

  async function handleOpenPayment(commitment: CommitmentListItem) {
    const actionMonth = selectedMonthRef.current;
    setPaymentDraft({ status: "loading", commitment });

    try {
      const response = await fetch(QUICK_ENTRY_OPTIONS_ENDPOINT);

      if (!response.ok) {
        throw new Error(`Payment options request failed with status ${response.status}.`);
      }

      const options = (await response.json()) as QuickEntryOptions;
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setPaymentDraft({
        status: "ready",
        commitment,
        options,
        accountId: options.lastUsedAccountId ?? options.accounts[0]?.id ?? "",
        categoryId: suggestExpenseCategoryId(commitment.nombre, options.categories.GASTO),
      });
    } catch {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setPaymentDraft({ status: "error", commitment, message: "No se pudieron cargar las opciones de pago." });
    }
  }

  async function handleToggleTemplate(template: CommitmentTemplateListItem) {
    if (state.status !== "success") {
      return;
    }

    const actionMonth = selectedMonthRef.current;
    setState({ ...state, templateError: undefined, templateNotice: undefined, togglingTemplateId: template.id });

    try {
      const response = await fetch(`${COMMITMENT_TEMPLATES_ENDPOINT}/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !template.activa }),
      });

      if (!response.ok) {
        throw new Error(`Update commitment template request failed with status ${response.status}.`);
      }

      const refreshed = await refreshCommitmentsAfterTemplateSave();

      if (!refreshed) {
        if (!isCurrentActionMonth(actionMonth)) {
          return;
        }

        setState({
          ...state,
          templateError: "La plantilla se actualizó, pero no se pudieron recargar los compromisos.",
          togglingTemplateId: undefined,
        });
      }
    } catch {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setState({ ...state, templateError: "No se pudo actualizar la plantilla recurrente.", togglingTemplateId: undefined });
    }
  }

  async function handleSubmitCreateTemplate() {
    if (state.status !== "success" || !createTemplateDraft) {
      return;
    }

    const currentDraft = createTemplateDraft;
    const actionMonth = selectedMonthRef.current;
    setState({ ...state, templateError: undefined, templateNotice: undefined, creatingTemplate: true });
    setCreateTemplateDraft({ ...currentDraft, error: undefined });

    try {
      const response = await fetch(COMMITMENT_TEMPLATES_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildTemplatePayload(currentDraft)),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(toTemplateFormErrorMessage(body?.error, "create"));
      }

      const refreshed = await refreshCommitmentsAfterTemplateSave();

      if (refreshed) {
        setCreateTemplateDraft(null);
      } else {
        if (!isCurrentActionMonth(actionMonth)) {
          return;
        }

        setState({ ...state, creatingTemplate: false, templateError: undefined });
        setCreateTemplateDraft({ ...currentDraft, error: "La plantilla se creó, pero no se pudieron recargar los compromisos." });
      }
    } catch (error) {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setState({ ...state, creatingTemplate: false, templateError: undefined });
      setCreateTemplateDraft({ ...currentDraft, error: error instanceof Error ? error.message : "No se pudo crear la plantilla recurrente." });
    }
  }

  async function handleSubmitEditTemplate() {
    if (state.status !== "success" || !editTemplateDraft) {
      return;
    }

    const currentDraft = editTemplateDraft;
    const actionMonth = selectedMonthRef.current;
    const currentMonthNotice = buildTemplateEditCurrentMonthNotice(state.data, currentDraft.id);
    setState({ ...state, templateError: undefined, templateNotice: undefined, editingTemplateId: currentDraft.id });
    setEditTemplateDraft({ ...currentDraft, error: undefined });

    try {
      const response = await fetch(`${COMMITMENT_TEMPLATES_ENDPOINT}/${currentDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildTemplatePayload(currentDraft)),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(toTemplateFormErrorMessage(body?.error, "edit"));
      }

      const refreshed = await refreshCommitmentsAfterTemplateSave(currentMonthNotice);

      if (refreshed) {
        setEditTemplateDraft(null);
      } else {
        if (!isCurrentActionMonth(actionMonth)) {
          return;
        }

        setState({ ...state, editingTemplateId: undefined, templateError: undefined });
        setEditTemplateDraft({ ...currentDraft, error: "La plantilla se actualizó, pero no se pudieron recargar los compromisos." });
      }
    } catch (error) {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setState({ ...state, editingTemplateId: undefined, templateError: undefined });
      setEditTemplateDraft({ ...currentDraft, error: error instanceof Error ? error.message : "No se pudo actualizar la plantilla recurrente." });
    }
  }

  async function handleDeleteTemplate(template: CommitmentTemplateListItem) {
    if (state.status !== "success") {
      return;
    }

    const confirmed = window.confirm(`¿Eliminar la plantilla recurrente ${template.nombre}?`);

    if (!confirmed) {
      return;
    }

    setPaymentDraft(null);
    setCreateDraft(null);
    setEditDraft(null);
    setCreateTemplateDraft(null);
    setEditTemplateDraft(null);
    const actionMonth = selectedMonthRef.current;
    setState({ ...state, templateError: undefined, templateNotice: undefined, deletingTemplateId: template.id });

    try {
      const response = await fetch(`${COMMITMENT_TEMPLATES_ENDPOINT}/${template.id}`, { method: "DELETE" });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(toDeleteTemplateErrorMessage(response.status, body?.error));
      }

      const refreshed = await refreshCommitmentsAfterTemplateSave();

      if (!refreshed) {
        if (!isCurrentActionMonth(actionMonth)) {
          return;
        }

        setState({
          ...state,
          templateError: "La plantilla se eliminó, pero no se pudieron recargar los compromisos.",
          deletingTemplateId: undefined,
        });
      }
    } catch (error) {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setState({
        ...state,
        deletingTemplateId: undefined,
        templateError: error instanceof Error ? error.message : "No se pudo eliminar la plantilla recurrente.",
      });
    }
  }

  async function handleSubmitPayment() {
    if (state.status !== "success") {
      return;
    }

    if (!paymentDraft || paymentDraft.status !== "ready") {
      return;
    }

    const currentDraft = paymentDraft;
    const actionMonth = selectedMonthRef.current;

    setState({ ...state, actionError: undefined, payingCommitmentId: currentDraft.commitment.id });
    setPaymentDraft({ ...currentDraft, submitError: undefined });

    try {
      const response = await fetch(`/api/commitments/${currentDraft.commitment.id}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: currentDraft.accountId, categoryId: currentDraft.categoryId }),
      });

      if (!response.ok) {
        throw new Error(`Pay commitment request failed with status ${response.status}.`);
      }

      setPaymentDraft(null);
      await loadCommitments(selectedMonthRef.current);
    } catch {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setState({ ...state, actionError: undefined, payingCommitmentId: undefined });
      setPaymentDraft({ ...currentDraft, submitError: "No se pudo marcar el compromiso como pagado." });
    }
  }

  async function handleMarkUnpaid(commitment: CommitmentListItem) {
    if (state.status !== "success") {
      return;
    }

    setPaymentDraft(null);
    setEditDraft(null);
    setCreateDraft(null);
    const actionMonth = selectedMonthRef.current;
    setState({ ...state, actionError: undefined, revertingCommitmentId: commitment.id });

    try {
      const response = await fetch(`/api/commitments/${commitment.id}/unpay`, { method: "PATCH" });

      if (!response.ok) {
        throw new Error(`Revert commitment payment request failed with status ${response.status}.`);
      }

      await loadCommitments(selectedMonthRef.current);
    } catch {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setState({ ...state, actionError: "No se pudo revertir el pago del compromiso.", revertingCommitmentId: undefined });
    }
  }

  async function handleSubmitEditCommitment() {
    if (state.status !== "success" || !editDraft) {
      return;
    }

    const currentDraft = editDraft;
    const actionMonth = selectedMonthRef.current;
    setState({ ...state, editingCommitmentId: currentDraft.id, actionError: undefined });
    setEditDraft({ ...currentDraft, error: undefined });

    try {
      const response = await fetch(`/api/commitments/${currentDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCommitmentPayload(currentDraft, selectedMonth)),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(toCommitmentFormErrorMessage(body?.error, "edit"));
      }

      setEditDraft(null);
      await loadCommitments(selectedMonthRef.current);
    } catch (error) {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setState({ ...state, editingCommitmentId: undefined, actionError: undefined });
      setEditDraft({ ...currentDraft, error: error instanceof Error ? error.message : "No se pudo actualizar el compromiso." });
    }
  }

  async function handleSubmitCreateCommitment() {
    if (state.status !== "success" || !createDraft) {
      return;
    }

    const currentDraft = createDraft;
    const actionMonth = selectedMonthRef.current;
    setState({ ...state, creatingCommitment: true, actionError: undefined });
    setCreateDraft({ ...currentDraft, error: undefined });

    try {
      const response = await fetch(CREATE_COMMITMENT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateCommitmentPayload(currentDraft, selectedMonth)),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(toCreateCommitmentErrorMessage(body?.error));
      }

      setCreateDraft(null);
      await loadCommitments(selectedMonthRef.current);
    } catch (error) {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setState({ ...state, creatingCommitment: false, actionError: undefined });
      setCreateDraft({ ...currentDraft, error: error instanceof Error ? error.message : "No se pudo crear el compromiso." });
    }
  }

  async function handleDeleteCommitment(commitment: CommitmentListItem) {
    if (state.status !== "success") {
      return;
    }

    const confirmed = window.confirm(`¿Eliminar el compromiso ${commitment.nombre}?`);

    if (!confirmed) {
      return;
    }

    setPaymentDraft(null);
    setEditDraft(null);
    setCreateDraft(null);
    const actionMonth = selectedMonthRef.current;
    setState({ ...state, actionError: undefined, deletingCommitmentId: commitment.id });

    try {
      const response = await fetch(`/api/commitments/${commitment.id}`, { method: "DELETE" });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(toDeleteCommitmentErrorMessage(body?.error));
      }

      await loadCommitments(selectedMonthRef.current);
    } catch (error) {
      if (!isCurrentActionMonth(actionMonth)) {
        return;
      }

      setState({
        ...state,
        deletingCommitmentId: undefined,
        actionError: error instanceof Error ? error.message : "No se pudo eliminar el compromiso.",
      });
    }
  }

  function handleOpenCreateCommitment() {
    setPaymentDraft(null);
    setEditDraft(null);
    setCreateTemplateDraft(null);
    setEditTemplateDraft(null);
    setCreateDraft(toCreateDraft(selectedMonth));
  }

  function handleOpenEditCommitment(commitment: CommitmentListItem) {
    setPaymentDraft(null);
    setCreateDraft(null);
    setCreateTemplateDraft(null);
    setEditTemplateDraft(null);
    setEditDraft(toEditDraft(commitment, selectedMonth));
  }

  function handleOpenCreateTemplate() {
    setPaymentDraft(null);
    setCreateDraft(null);
    setEditDraft(null);
    setEditTemplateDraft(null);
    setCreateTemplateDraft(EMPTY_TEMPLATE_DRAFT);
  }

  function handleOpenEditTemplate(template: CommitmentTemplateListItem) {
    setPaymentDraft(null);
    setCreateDraft(null);
    setEditDraft(null);
    setCreateTemplateDraft(null);
    setEditTemplateDraft(toEditTemplateDraft(template));
  }

  const commitmentState: CommitmentUiState = {
    isCreating: state.status === "success" ? Boolean(state.creatingCommitment) : false,
    editingId: state.status === "success" ? state.editingCommitmentId : undefined,
    deletingId: state.status === "success" ? state.deletingCommitmentId : undefined,
    payingId: state.status === "success" ? state.payingCommitmentId : undefined,
    revertingId: state.status === "success" ? state.revertingCommitmentId : undefined,
  };

  const templateState: TemplateUiState = {
    isCreating: state.status === "success" ? Boolean(state.creatingTemplate) : false,
    editingId: state.status === "success" ? state.editingTemplateId : undefined,
    togglingId: state.status === "success" ? state.togglingTemplateId : undefined,
    deletingId: state.status === "success" ? state.deletingTemplateId : undefined,
  };

  const commitmentDrafts: CommitmentDrafts = { payment: paymentDraft, create: createDraft, edit: editDraft };
  const templateDrafts: TemplateDrafts = { create: createTemplateDraft, edit: editTemplateDraft };
  const isCommitmentPanelActive = Boolean(paymentDraft || createDraft || editDraft || createTemplateDraft || editTemplateDraft);

  const commitmentActions: CommitmentActions = {
    openCreate: handleOpenCreateCommitment,
    cancelCreate: () => setCreateDraft(null),
    changeCreateDraft: setCreateDraft,
    submitCreate: handleSubmitCreateCommitment,
    openEdit: handleOpenEditCommitment,
    cancelEdit: () => setEditDraft(null),
    changeEditDraft: setEditDraft,
    submitEdit: handleSubmitEditCommitment,
    delete: handleDeleteCommitment,
    markPaid: handleOpenPayment,
    markUnpaid: handleMarkUnpaid,
  };

  const paymentActions: PaymentActions = {
    cancel: () => setPaymentDraft(null),
    changeDraft: setPaymentDraft,
    submit: handleSubmitPayment,
  };

  const templateActions: TemplateActions = {
    toggle: handleToggleTemplate,
    openCreate: handleOpenCreateTemplate,
    cancelCreate: () => setCreateTemplateDraft(null),
    changeCreateDraft: setCreateTemplateDraft,
    submitCreate: handleSubmitCreateTemplate,
    openEdit: handleOpenEditTemplate,
    cancelEdit: () => setEditTemplateDraft(null),
    changeEditDraft: setEditTemplateDraft,
    submitEdit: handleSubmitEditTemplate,
    delete: handleDeleteTemplate,
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-phone commitments-phone">
        <div className="movements-header">
          <h1 className="dashboard-title">Compromisos</h1>
        </div>

        <MonthSelector selectedMonth={selectedMonth} selectedMonthLabel={state.status === "success" ? state.data.currentMonthLabel : undefined} onChange={handleSelectedMonthChange} />

        {state.status === "loading" ? <CommitmentsStatus message="Cargando compromisos..." /> : null}
        {state.status === "error" ? <CommitmentsStatus message={state.message} /> : null}
        {state.status === "success" ? (
          <CommitmentsContent
            data={state.data}
            templates={state.templates}
            actionError={state.actionError}
            templateError={state.templateError}
            templateNotice={state.templateNotice}
            commitmentState={commitmentState}
            templateState={templateState}
            commitmentDrafts={commitmentDrafts}
            templateDrafts={templateDrafts}
            commitmentActions={commitmentActions}
            paymentActions={paymentActions}
            templateActions={templateActions}
            selectedMonth={selectedMonth}
            selectedMonthLabel={state.data.currentMonthLabel}
          />
        ) : null}

        {!isCommitmentPanelActive ? (
          <button className="dashboard-fab" aria-label="Agregar movimiento" onClick={onQuickEntry}>
            <Plus size={26} />
          </button>
        ) : null}

        <BottomNav
          onNavigateDashboard={onNavigateDashboard}
          onNavigateMovements={onNavigateMovements}
          onNavigateAccounts={onNavigateAccounts}
          onNavigateGoals={onNavigateGoals}
        />
      </div>
    </div>
  );
}

function CommitmentsContent({
  data,
  templates,
  actionError,
  templateError,
  templateNotice,
  commitmentState,
  templateState,
  commitmentDrafts,
  templateDrafts,
  commitmentActions,
  paymentActions,
  templateActions,
  selectedMonth,
  selectedMonthLabel,
}: CommitmentsContentProps) {
  const pendingGroup = data.groups.find((group) => group.status === "PENDIENTE");
  const paidGroup = data.groups.find((group) => group.status === "PAGADO");
  const hasCommitments = data.groups.some((group) => group.commitments.length > 0);

  return (
    <div className="commitments-content">
      {hasCommitments ? <CommitmentsSummary data={data} /> : null}

      <CommitmentTemplatesSection templates={templates} error={templateError} notice={templateNotice} state={templateState} drafts={templateDrafts} actions={templateActions} />

      {hasCommitments && actionError ? <CommitmentsStatus message={actionError} /> : null}
      <CreateCommitmentAction onOpenCreate={commitmentActions.openCreate} />
      <CommitmentDraftPanels drafts={commitmentDrafts} state={commitmentState} actions={commitmentActions} selectedMonth={selectedMonth} selectedMonthLabel={selectedMonthLabel} />
      {hasCommitments && commitmentDrafts.payment ? (
        <PaymentConfirmationPanel
          draft={commitmentDrafts.payment}
          isSubmitting={commitmentState.payingId === commitmentDrafts.payment.commitment.id}
          onCancel={paymentActions.cancel}
          onChange={paymentActions.changeDraft}
          onSubmit={paymentActions.submit}
        />
      ) : null}

      {hasCommitments ? (
        <>
          {pendingGroup && pendingGroup.commitments.length > 0 ? <CommitmentGroupSection group={pendingGroup} payingCommitmentId={commitmentState.payingId} deletingCommitmentId={commitmentState.deletingId} onMarkPaid={commitmentActions.markPaid} onMarkUnpaid={commitmentActions.markUnpaid} onOpenEdit={commitmentActions.openEdit} onDelete={commitmentActions.delete} /> : null}
          {paidGroup && paidGroup.commitments.length > 0 ? <CommitmentGroupSection group={paidGroup} revertingCommitmentId={commitmentState.revertingId} onMarkPaid={commitmentActions.markPaid} onMarkUnpaid={commitmentActions.markUnpaid} onOpenEdit={commitmentActions.openEdit} onDelete={commitmentActions.delete} /> : null}
        </>
      ) : (
        <CommitmentsStatus message="Sin compromisos este mes." />
      )}
    </div>
  );
}

function CommitmentsSummary({ data }: { data: CommitmentsData }) {
  return (
    <section className={`commitments-summary${data.summary.pendingCount === 0 ? " commitments-summary--clear" : ""}`}>
      <p className="commitments-summary-label">
        {data.summary.pendingCount > 0 ? `${data.summary.pendingCount} pendientes` : "Mes al día"}
      </p>
      <p className="commitments-summary-amount">{data.summary.pendingCount > 0 ? formatCLP(data.summary.pendingTotal) : "✓"}</p>
    </section>
  );
}

function CommitmentDraftPanels({
  drafts,
  state,
  actions,
  selectedMonth,
  selectedMonthLabel,
}: {
  drafts: CommitmentDrafts;
  state: CommitmentUiState;
  actions: CommitmentActions;
  selectedMonth: string;
  selectedMonthLabel: string;
}) {
  return (
    <>
      {drafts.create ? (
        <CreateCommitmentPanel
          draft={drafts.create}
          isSubmitting={state.isCreating}
          selectedMonth={selectedMonth}
          selectedMonthLabel={selectedMonthLabel}
          onCancel={actions.cancelCreate}
          onChange={actions.changeCreateDraft}
          onSubmit={actions.submitCreate}
        />
      ) : null}
      {drafts.edit ? (
        <CommitmentFormPanel
          title="Editar compromiso"
          detail={`Se actualizará para ${selectedMonthLabel}`}
          submitLabel="Guardar cambios"
          submittingLabel="Guardando..."
          regionLabel={`Editar compromiso ${drafts.edit.nombre}`}
          draft={drafts.edit}
          isSubmitting={state.editingId === drafts.edit.id}
          selectedMonth={selectedMonth}
          onCancel={actions.cancelEdit}
          onChange={actions.changeEditDraft}
          onSubmit={actions.submitEdit}
        />
      ) : null}
    </>
  );
}

function CommitmentTemplatesSection({
  templates,
  error,
  notice,
  state,
  drafts,
  actions,
}: {
  templates: CommitmentTemplateListItem[];
  error?: string;
  notice?: string;
  state: TemplateUiState;
  drafts: TemplateDrafts;
  actions: TemplateActions;
}) {
  return (
    <section className="accounts-group commitments-templates-section" aria-label="Plantillas recurrentes">
      <div className="commitments-templates-header">
        <h2 className="accounts-group-label">Recurrentes</h2>
        <button className="commitments-action-button commitments-action-button--success commitments-template-create-button" onClick={actions.openCreate} aria-label="Agregar plantilla recurrente">
          <Plus size={12} /> Agregar recurrente
        </button>
      </div>
      <p className="commitments-templates-notice">
        Desactivar evita compromisos futuros. Si ya generó compromisos, la plantilla se conserva para no romper el historial. Eliminar se usará solo en casos seguros.
      </p>
      {notice ? <CommitmentsStatus message={notice} /> : null}
      {error ? <p className="quick-entry-error" role="alert">{error}</p> : null}
      {templates.length === 0 && !drafts.create ? <p className="commitments-templates-empty">Sin plantillas recurrentes.</p> : null}
      <div className="commitments-list">
        {drafts.create ? <TemplateFormPanel title="Nueva plantilla recurrente" detail="Se usará para generar próximos meses" submitLabel="Guardar plantilla" submittingLabel="Guardando..." regionLabel="Nueva plantilla recurrente" draft={drafts.create} isSubmitting={state.isCreating} onCancel={actions.cancelCreate} onChange={actions.changeCreateDraft} onSubmit={actions.submitCreate} isCard /> : null}
        {templates.map((template) => (
          drafts.edit?.id === template.id ? (
            <TemplateFormPanel key={template.id} title="Editar plantilla recurrente" detail="No cambia compromisos ya generados" submitLabel="Guardar cambios" submittingLabel="Guardando..." regionLabel={`Editar plantilla recurrente ${drafts.edit.nombre}`} draft={drafts.edit} isSubmitting={state.editingId === drafts.edit.id} onCancel={actions.cancelEdit} onChange={actions.changeEditDraft} onSubmit={actions.submitEdit} isCard />
          ) : (
            <article key={template.id} className={`dashboard-card commitments-card${!template.activa ? " commitments-card--paid" : ""}`}>
              <div className="commitments-card-main">
                <div className="dashboard-movement-icon">{getCommitmentIcon(template.tipo)}</div>
                <div className="commitments-card-copy">
                  <div className="commitments-title-row">
                    <p className="dashboard-movement-title">{template.nombre}</p>
                    <span className="commitments-type-pill">{template.activa ? "Activa" : "Inactiva"}</span>
                  </div>
                  <p className="dashboard-movement-meta">{formatTemplateMeta(template)}</p>
                </div>
                <div className="commitments-card-side">
                  <p className="dashboard-movement-amount">{formatCLP(template.montoDefault)}</p>
                </div>
              </div>
              <div className="commitments-card-actions">
                <button className="commitments-action-button commitments-action-button--neutral" onClick={() => actions.openEdit(template)} aria-label={`Editar plantilla ${template.nombre}`}>
                  <Pencil size={12} /> Editar
                </button>
                <button className={`commitments-action-button ${template.activa ? "commitments-action-button--warning" : "commitments-action-button--success"}`} onClick={() => actions.toggle(template)} disabled={state.togglingId === template.id} aria-label={`${template.activa ? "Pausar" : "Activar"} ${template.nombre}`}>
                  {state.togglingId === template.id ? "Actualizando..." : template.activa ? "Pausar" : "Activar"}
                </button>
                <button className="commitments-action-button commitments-action-button--danger" onClick={() => actions.delete(template)} disabled={state.deletingId === template.id} aria-label={`Eliminar plantilla ${template.nombre}`}>
                  {state.deletingId === template.id ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            </article>
          )
        ))}
      </div>
    </section>
  );
}

function CreateCommitmentAction({ onOpenCreate }: { onOpenCreate: () => void }) {
  return (
    <div className="commitments-create-action">
      <button className="commitments-confirm-button commitments-create-button" aria-label="Agregar compromiso" onClick={onOpenCreate}>
        Agregar compromiso
      </button>
    </div>
  );
}

function CreateCommitmentPanel({
  draft,
  isSubmitting,
  selectedMonth,
  selectedMonthLabel,
  onCancel,
  onChange,
  onSubmit,
}: {
  draft: CreateCommitmentDraft;
  isSubmitting: boolean;
  selectedMonth: string;
  selectedMonthLabel: string;
  onCancel: () => void;
  onChange: (draft: CreateCommitmentDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <CommitmentFormPanel
      title="Nuevo compromiso"
      detail={`Se creará para ${selectedMonthLabel}`}
      submitLabel="Guardar compromiso"
      submittingLabel="Guardando..."
      regionLabel="Nuevo compromiso"
      draft={draft}
      isSubmitting={isSubmitting}
      selectedMonth={selectedMonth}
      onCancel={onCancel}
      onChange={onChange}
      onSubmit={onSubmit}
    />
  );
}

function CommitmentFormPanel<TDraft extends CreateCommitmentDraft>({
  title,
  detail,
  submitLabel,
  submittingLabel,
  regionLabel,
  draft,
  isSubmitting,
  selectedMonth,
  onCancel,
  onChange,
  onSubmit,
}: {
  title: string;
  detail: string;
  submitLabel: string;
  submittingLabel: string;
  regionLabel: string;
  draft: TDraft;
  isSubmitting: boolean;
  selectedMonth: string;
  onCancel: () => void;
  onChange: (draft: TDraft) => void;
  onSubmit: () => void;
}) {
  const canSubmit = Boolean(draft.nombre.trim() && draft.monto !== "" && draft.fechaVencimiento) && !isSubmitting;

  return (
    <section className="commitments-payment-panel" aria-label={regionLabel}>
      <div className="commitments-payment-header">
        <div>
          <p className="commitments-payment-title">{title}</p>
          <p className="commitments-payment-detail">{detail}</p>
        </div>
        <button className="commitments-secondary-button" onClick={onCancel}>Cancelar</button>
      </div>

      {draft.error ? <p className="quick-entry-error" role="alert">{draft.error}</p> : null}

      <label className="commitments-payment-field">
        <span>Nombre</span>
        <input value={draft.nombre} onChange={(event) => onChange({ ...draft, nombre: event.target.value, error: undefined })} />
      </label>

      <label className="commitments-payment-field">
        <span>Tipo</span>
        <select value={draft.tipo} onChange={(event) => onChange({ ...draft, tipo: event.target.value as CommitmentType, error: undefined })}>
          <option value="RECURRENTE">Recurrente</option>
          <option value="DEUDA">Deuda</option>
          <option value="VARIABLE">Variable</option>
        </select>
      </label>

      <label className="commitments-payment-field">
        <span>Monto</span>
        <input inputMode="numeric" value={draft.monto} onChange={(event) => onChange({ ...draft, monto: event.target.value.replace(/\D/g, ""), error: undefined })} />
      </label>

      <label className="commitments-payment-field">
        <span>Fecha de vencimiento</span>
        <input type="date" min={getMonthStart(selectedMonth)} max={getMonthEnd(selectedMonth)} value={draft.fechaVencimiento} onChange={(event) => onChange({ ...draft, fechaVencimiento: event.target.value, error: undefined })} />
      </label>

      <label className="commitments-payment-field">
        <span>Notas</span>
        <input value={draft.notas} onChange={(event) => onChange({ ...draft, notas: event.target.value, error: undefined })} />
      </label>

      <button className="commitments-confirm-button" disabled={!canSubmit} onClick={onSubmit}>
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    </section>
  );
}

function TemplateFormPanel<TDraft extends TemplateDraft>({
  title,
  detail,
  submitLabel,
  submittingLabel,
  regionLabel,
  draft,
  isSubmitting,
  onCancel,
  onChange,
  onSubmit,
  isCard = false,
}: {
  title: string;
  detail: string;
  submitLabel: string;
  submittingLabel: string;
  regionLabel: string;
  draft: TDraft;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (draft: TDraft) => void;
  onSubmit: () => void;
  isCard?: boolean;
}) {
  const canSubmit = Boolean(draft.nombre.trim() && draft.montoDefault !== "") && !isSubmitting;

  return (
    <section className={`commitments-payment-panel${isCard ? " commitments-template-form-card" : ""}`} aria-label={regionLabel}>
      <div className="commitments-payment-header">
        <div>
          <p className="commitments-payment-title">{title}</p>
          <p className="commitments-payment-detail">{detail}</p>
        </div>
        <button className="commitments-secondary-button" onClick={onCancel}>Cancelar</button>
      </div>

      {draft.error ? <p className="quick-entry-error" role="alert">{draft.error}</p> : null}

      <label className="commitments-payment-field">
        <span>Nombre</span>
        <input value={draft.nombre} onChange={(event) => onChange({ ...draft, nombre: event.target.value, error: undefined })} />
      </label>

      <label className="commitments-payment-field">
        <span>Tipo</span>
        <select value={draft.tipo} onChange={(event) => onChange({ ...draft, tipo: event.target.value as CommitmentType, error: undefined })}>
          <option value="RECURRENTE">Recurrente</option>
          <option value="DEUDA">Deuda</option>
          <option value="VARIABLE">Variable</option>
        </select>
      </label>

      <label className="commitments-payment-field">
        <span>Monto base</span>
        <input inputMode="numeric" value={draft.montoDefault} onChange={(event) => onChange({ ...draft, montoDefault: event.target.value.replace(/\D/g, ""), error: undefined })} />
      </label>

      <label className="commitments-payment-field">
        <span>Día de vencimiento (opcional)</span>
        <select value={draft.diaVencimiento} onChange={(event) => onChange({ ...draft, diaVencimiento: event.target.value, error: undefined })}>
          <option value="">Sin día fijo</option>
          {DUE_DAY_OPTIONS.map((day) => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
      </label>

      <label className="commitments-payment-field">
        <span>Notas</span>
        <input value={draft.notas} onChange={(event) => onChange({ ...draft, notas: event.target.value, error: undefined })} />
      </label>

      <label className="commitments-payment-field">
        <span>Estado</span>
        <select value={draft.activa ? "activa" : "inactiva"} onChange={(event) => onChange({ ...draft, activa: event.target.value === "activa", error: undefined })}>
          <option value="activa">Activa</option>
          <option value="inactiva">Inactiva</option>
        </select>
      </label>

      <button className="commitments-confirm-button" disabled={!canSubmit} onClick={onSubmit}>
        {isSubmitting ? submittingLabel : submitLabel}
      </button>
    </section>
  );
}

function PaymentConfirmationPanel({
  draft,
  isSubmitting,
  onCancel,
  onChange,
  onSubmit,
}: {
  draft: PaymentDraft;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (draft: PaymentDraft) => void;
  onSubmit: () => void;
}) {
  if (draft.status === "loading") {
    return <CommitmentsStatus message="Cargando opciones de pago..." />;
  }

  if (draft.status === "error") {
    return (
      <section className="commitments-payment-panel" aria-label={`Confirmar pago ${draft.commitment.nombre}`}>
        <p className="commitments-payment-title">Confirmar pago</p>
        <p className="quick-entry-error" role="alert">{draft.message}</p>
        <button className="commitments-secondary-button" onClick={onCancel}>Cancelar</button>
      </section>
    );
  }

  const canSubmit = Boolean(draft.accountId && draft.categoryId) && !isSubmitting;

  return (
    <section className="commitments-payment-panel" aria-label={`Confirmar pago ${draft.commitment.nombre}`}>
      <div className="commitments-payment-header">
        <div>
          <p className="commitments-payment-title">Confirmar pago</p>
          <p className="commitments-payment-detail">{draft.commitment.nombre} · {formatCLP(draft.commitment.monto)}</p>
        </div>
        <button className="commitments-secondary-button" onClick={onCancel}>Cancelar</button>
      </div>

      {draft.submitError ? <p className="quick-entry-error" role="alert">{draft.submitError}</p> : null}

      <label className="commitments-payment-field">
        <span>Cuenta</span>
        <select value={draft.accountId} onChange={(event) => onChange({ ...draft, accountId: event.target.value, submitError: undefined })}>
          {draft.options.accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.nombre}</option>
          ))}
        </select>
      </label>

      <label className="commitments-payment-field">
        <span>Categoría</span>
        <select value={draft.categoryId} onChange={(event) => onChange({ ...draft, categoryId: event.target.value, submitError: undefined })}>
          {draft.options.categories.GASTO.map((category) => (
            <option key={category.id} value={category.id}>{category.nombre}</option>
          ))}
        </select>
      </label>

      <button className="commitments-confirm-button" disabled={!canSubmit} onClick={onSubmit}>
        {isSubmitting ? "Pagando..." : "Confirmar pago"}
      </button>
    </section>
  );
}

function CommitmentGroupSection({
  group,
  payingCommitmentId,
  revertingCommitmentId,
  deletingCommitmentId,
  onMarkPaid,
  onMarkUnpaid,
  onOpenEdit,
  onDelete,
}: {
  group: CommitmentGroup;
  payingCommitmentId?: string;
  revertingCommitmentId?: string;
  deletingCommitmentId?: string;
  onMarkPaid: (commitment: CommitmentListItem) => void;
  onMarkUnpaid: (commitment: CommitmentListItem) => void;
  onOpenEdit: (commitment: CommitmentListItem) => void;
  onDelete: (commitment: CommitmentListItem) => void;
}) {
  return (
    <section className="accounts-group">
      <h2 className="accounts-group-label">{group.label}</h2>
      <div className="commitments-list">
        {group.commitments.map((commitment) => (
          <CommitmentCard
            key={commitment.id}
            commitment={commitment}
            isPaying={payingCommitmentId === commitment.id}
            isReverting={revertingCommitmentId === commitment.id}
            isDeleting={deletingCommitmentId === commitment.id}
            onMarkPaid={onMarkPaid}
            onMarkUnpaid={onMarkUnpaid}
            onOpenEdit={onOpenEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}

function CommitmentCard({
  commitment,
  isPaying,
  isReverting,
  isDeleting,
  onMarkPaid,
  onMarkUnpaid,
  onOpenEdit,
  onDelete,
}: {
  commitment: CommitmentListItem;
  isPaying: boolean;
  isReverting: boolean;
  isDeleting: boolean;
  onMarkPaid: (commitment: CommitmentListItem) => void;
  onMarkUnpaid: (commitment: CommitmentListItem) => void;
  onOpenEdit: (commitment: CommitmentListItem) => void;
  onDelete: (commitment: CommitmentListItem) => void;
}) {
  const isPending = commitment.estado === "PENDIENTE";

  return (
    <article className={`dashboard-card commitments-card${!isPending ? " commitments-card--paid" : ""}`}>
      <div className="commitments-card-main">
        <div className="dashboard-movement-icon">{getCommitmentIcon(commitment.tipo)}</div>
        <div className="commitments-card-copy">
          <div className="commitments-title-row">
            <p className="dashboard-movement-title">{commitment.nombre}</p>
            <span className="commitments-type-pill">{getTypeLabel(commitment.tipo)}</span>
          </div>
          <p className="dashboard-movement-meta">{isPending ? formatDueDate(commitment) : "Pagado"}</p>
        </div>
        <div className="commitments-card-side">
          <p className="dashboard-movement-amount">{formatCLP(commitment.monto)}</p>
        </div>
      </div>
      {isPending ? (
        <div className="commitments-card-actions">
          <button className="commitments-action-button commitments-action-button--neutral" onClick={() => onOpenEdit(commitment)} aria-label={`Editar ${commitment.nombre}`}>
            <Pencil size={12} /> Editar
          </button>
          <button className="commitments-action-button commitments-action-button--danger" onClick={() => onDelete(commitment)} disabled={isDeleting} aria-label={`Eliminar ${commitment.nombre}`}>
            <Trash2 size={12} /> {isDeleting ? "Eliminando..." : "Eliminar"}
          </button>
          <button className="commitments-action-button commitments-action-button--success" onClick={() => onMarkPaid(commitment)} disabled={isPaying} aria-label={`Marcar pagado ${commitment.nombre}`}>
            {isPaying ? "Marcando..." : "Marcar pagado"}
          </button>
        </div>
      ) : (
        <div className="commitments-card-actions commitments-card-actions--status">
          <span className="commitments-paid-label"><Check size={12} /> Pagado</span>
          {commitment.canRevertPayment ? (
            <button className="commitments-action-button commitments-action-button--warning" onClick={() => onMarkUnpaid(commitment)} disabled={isReverting} aria-label={`Marcar pendiente ${commitment.nombre}`}>
              {isReverting ? "Revirtiendo..." : "Marcar pendiente"}
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}

function CommitmentsStatus({ message }: { message: string }) {
  return (
    <div className="movements-status" role="status">
      <p>{message}</p>
    </div>
  );
}

function MonthSelector({ selectedMonth, selectedMonthLabel, onChange }: { selectedMonth: string; selectedMonthLabel?: string; onChange: (month: string) => void }) {
  const readableMonthLabel = selectedMonthLabel ?? formatMonthLabel(selectedMonth);

  return (
    <section className="commitments-month-switcher" aria-label="Selector de mes de compromisos">
      <div className="commitments-month-switcher-header">
        <span className="commitments-month-eyebrow">Mes seleccionado</span>
        <strong className="commitments-month-label">{readableMonthLabel}</strong>
      </div>
      <div className="commitments-month-controls">
        <button className="commitments-month-nav-button" type="button" onClick={() => onChange(addMonths(selectedMonth, -1))} aria-label="Mes anterior">
          <ChevronLeft size={14} /> Anterior
        </button>
        <label className="commitments-month-input-label">
          <span>Mes</span>
          <input type="month" value={selectedMonth} onChange={(event) => onChange(event.target.value)} aria-label="Mes" />
        </label>
        <button className="commitments-month-nav-button" type="button" onClick={() => onChange(addMonths(selectedMonth, 1))} aria-label="Mes siguiente">
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </section>
  );
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) {
    return month;
  }

  const formatted = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function BottomNav({
  onNavigateDashboard,
  onNavigateMovements,
  onNavigateAccounts,
  onNavigateGoals,
}: {
  onNavigateDashboard?: () => void;
  onNavigateMovements?: () => void;
  onNavigateAccounts?: () => void;
  onNavigateGoals?: () => void;
}) {
  const navItems = useMemo(
    () => [
      { key: "dashboard", label: "Dash", icon: Home, onClick: onNavigateDashboard },
      { key: "movements", label: "Mov", icon: Receipt, onClick: onNavigateMovements },
      { key: "accounts", label: "Cta", icon: Wallet, onClick: onNavigateAccounts },
      { key: "goals", label: "Meta", icon: Target, onClick: onNavigateGoals },
      { key: "commitments", label: "Compr", icon: CalendarClock, onClick: undefined },
    ],
    [onNavigateDashboard, onNavigateMovements, onNavigateAccounts, onNavigateGoals],
  );

  return (
    <div className="dashboard-bottom-nav">
      <div className="dashboard-bottom-nav-inner">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.key} className={`dashboard-nav-item${item.key === "commitments" ? " dashboard-nav-item--active" : ""}`} onClick={item.onClick}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getCommitmentIcon(type: CommitmentType) {
  if (type === "DEUDA") {
    return <CreditCard size={16} />;
  }

  if (type === "VARIABLE") {
    return <Zap size={16} />;
  }

  return <Repeat size={16} />;
}

function getTypeLabel(type: CommitmentType) {
  if (type === "DEUDA") {
    return "Deuda";
  }

  if (type === "VARIABLE") {
    return "Variable";
  }

  return "Recurrente";
}

function formatDueDate(commitment: CommitmentListItem) {
  return commitment.dueDay ? `Vence día ${commitment.dueDay}` : "Sin fecha de vencimiento";
}

function formatTemplateMeta(template: CommitmentTemplateListItem) {
  return template.diaVencimiento ? `Genera desde el próximo mes · vence día ${template.diaVencimiento}` : "Genera desde el próximo mes · sin vencimiento";
}

function formatCLP(amount: number) {
  return `$${amount.toLocaleString("es-CL")}`;
}

function buildCreateCommitmentPayload(draft: CreateCommitmentDraft, selectedMonth: string) {
  return buildCommitmentPayload(draft, selectedMonth);
}

function buildCommitmentPayload(draft: CreateCommitmentDraft, selectedMonth: string) {
  const trimmedNotes = draft.notas.trim();

  return {
    nombre: draft.nombre.trim(),
    tipo: draft.tipo,
    monto: Number(draft.monto),
    month: selectedMonth,
    fechaVencimiento: draft.fechaVencimiento,
    ...(trimmedNotes ? { notas: trimmedNotes } : {}),
  };
}

function buildTemplatePayload(draft: TemplateDraft) {
  const trimmedNotes = draft.notas.trim();
  const trimmedDueDay = draft.diaVencimiento.trim();

  return {
    nombre: draft.nombre.trim(),
    tipo: draft.tipo,
    montoDefault: Number(draft.montoDefault),
    diaVencimiento: trimmedDueDay ? Number(trimmedDueDay) : null,
    activa: draft.activa,
    ...(trimmedNotes ? { notas: trimmedNotes } : { notas: null }),
  };
}

function toCreateCommitmentErrorMessage(serverError: string | undefined) {
  return toCommitmentFormErrorMessage(serverError, "create");
}

function toCommitmentFormErrorMessage(serverError: string | undefined, action: "create" | "edit") {
  if (serverError === "Amount must be an integer greater than zero.") {
    return "El monto debe ser mayor que cero.";
  }

  if (serverError === "nombre is required.") {
    return "El nombre es obligatorio.";
  }

  if (serverError === "Invalid due date." || serverError === "Due date must be in the selected month." || serverError === "Invalid commitment month format. Use YYYY-MM." || serverError === "Due date must be in July 2026.") {
    return "La fecha de vencimiento debe ser válida y estar dentro del mes seleccionado.";
  }

  if (serverError === "Commitment not found.") {
    return "No se encontró el compromiso.";
  }

  return action === "create" ? "No se pudo crear el compromiso." : "No se pudo actualizar el compromiso.";
}

function toTemplateFormErrorMessage(serverError: string | undefined, action: "create" | "edit") {
  if (serverError === "montoDefault must be an integer greater than zero.") {
    return "El monto base debe ser mayor que cero.";
  }

  if (serverError === "nombre is required.") {
    return "El nombre es obligatorio.";
  }

  if (serverError === "Invalid commitment type.") {
    return "El tipo de plantilla no es válido.";
  }

  if (serverError === "diaVencimiento must be an integer between 1 and 31 or null.") {
    return "El día de vencimiento debe estar entre 1 y 31, o quedar vacío.";
  }

  if (serverError === "Commitment template not found.") {
    return "No se encontró la plantilla recurrente.";
  }

  return action === "create" ? "No se pudo crear la plantilla recurrente." : "No se pudo actualizar la plantilla recurrente.";
}

function toDeleteCommitmentErrorMessage(serverError: string | undefined) {
  if (serverError === "Commitment not found.") {
    return "No se encontró el compromiso.";
  }

  if (serverError === "Paid commitments cannot be deleted.") {
    return "No se puede eliminar un compromiso pagado.";
  }

  return "No se pudo eliminar el compromiso.";
}

function toDeleteTemplateErrorMessage(status: number, serverError: string | undefined) {
  if (status === 409 || serverError === "Commitment template has generated commitments.") {
    return "Esta plantilla ya generó compromisos. No se puede eliminar sin afectar el historial. Déjala inactiva para que no genere compromisos futuros.";
  }

  if (serverError === "Commitment template not found.") {
    return "No se encontró la plantilla recurrente.";
  }

  return "No se pudo eliminar la plantilla recurrente.";
}

function toCreateDraft(selectedMonth: string): CreateCommitmentDraft {
  return {
    ...EMPTY_CREATE_DRAFT,
    fechaVencimiento: getMonthStart(selectedMonth),
  };
}

function toEditDraft(commitment: CommitmentListItem, selectedMonth: string): EditCommitmentDraft {
  return {
    id: commitment.id,
    nombre: commitment.nombre,
    tipo: commitment.tipo,
    monto: String(commitment.monto),
    fechaVencimiento: commitment.fechaVencimiento ?? getMonthStart(selectedMonth),
    notas: commitment.notas ?? "",
  };
}

function buildCommitmentsEndpoint(month: string) {
  return `/api/commitments?month=${encodeURIComponent(month)}`;
}

function buildTemplateEditCurrentMonthNotice(data: CommitmentsData, templateId: string) {
  const hasCurrentMonthCommitment = data.groups.some((group) =>
    group.commitments.some((commitment) => commitment.templateId === templateId && (!commitment.fechaVencimiento || commitment.fechaVencimiento.startsWith(data.currentMonth))),
  );

  if (!hasCurrentMonthCommitment) {
    return undefined;
  }

  return `Este cambio aplicará desde ${formatMonthLabel(addMonths(data.currentMonth, 1))}. El compromiso de ${formatMonthLabel(data.currentMonth)} ya generado no se modifica.`;
}

function getMonthStart(month: string) {
  return `${month}-01`;
}

function getMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function addMonths(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toEditTemplateDraft(template: CommitmentTemplateListItem): EditTemplateDraft {
  return {
    id: template.id,
    nombre: template.nombre,
    tipo: template.tipo,
    montoDefault: String(template.montoDefault),
    diaVencimiento: template.diaVencimiento === null ? "" : String(template.diaVencimiento),
    notas: template.notas ?? "",
    activa: template.activa,
  };
}

function suggestExpenseCategoryId(commitmentName: string, categories: QuickEntryOptions["categories"]["GASTO"]) {
  if (categories.length === 0) {
    return "";
  }

  const normalizedName = normalizeText(commitmentName);
  const suggestedCategoryName = /luz|agua|arriendo|servicio/.test(normalizedName)
    ? "servicios"
    : /plan celular|celular|netflix|spotify|play|suscrip/.test(normalizedName)
      ? "suscripciones"
      : null;

  if (suggestedCategoryName) {
    const match = categories.find((category) => normalizeText(category.nombre).includes(suggestedCategoryName));

    if (match) {
      return match.id;
    }
  }

  return categories[0]!.id;
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default CommitmentsPage;
