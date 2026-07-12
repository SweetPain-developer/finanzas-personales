# Estado actual — Finanzas Personales

Snapshot actualizado con evidencia funcional disponible al 12 de julio de 2026. Alcance: documentación solamente; no se modificó implementación.

## 1. Resumen ejecutivo

| Módulo | Estado | Cobertura de tests | Deuda conocida |
|---|---|---:|---|
| Dashboard | Completo | API/Web incluidos en suites verdes: API 272 tests, Web 133 tests | Variación patrimonial fija en `0`; default de mes `2026-07`. |
| Cuentas | Completo | API: accounts; Web: `AccountsPage.test.tsx` | Sin scripts raíz para levantar todo junto. |
| Movimientos | Completo | API: movements/transactions; Web: `MovementsPage.test.tsx` + Quick Entry | Swipe, scroll infinito y búsqueda avanzada siguen fuera del corte. |
| Metas | Completo | API: goals; Web: `GoalsPage.test.tsx` | Progreso depende 100% de saldo de cuenta asociada; decisión válida pero debe entenderse en uso real. |
| Compromisos | Completo para V1 operativa | API: commitments/templates; Web: `CommitmentsPage.test.tsx` | Compromisos pagados legacy locales sin `paymentTransactionId`; reversa legacy bloqueada. Accesibilidad real general no validada end-to-end. |

## 2. Módulos implementados

### Dashboard
- **Confirmado**: `GET /dashboard` calcula disponible, patrimonio líquido, ingresos/gastos del mes, metas activas y últimos movimientos; excluye transferencias internas por `transferId`.
- **Decisión**: patrimonio líquido = suma de cuentas activas; disponible = cuentas operativas menos compromisos pendientes.
- **Rutas/archivos**: `apps/api/src/dashboard/getDashboardData.ts`, `apps/api/src/app.ts`, `apps/web/src/DashboardPage.tsx`, `apps/web/src/Dashboard.tsx`.

### Cuentas
- **Confirmado**: listado agrupado, crear, editar, desactivar/reactivar y eliminar solo sin historial.
- **Decisión**: desactivar conserva historial; eliminar se bloquea con historial.
- **Rutas/archivos**: `apps/api/src/accounts/*`, `apps/web/src/AccountsPage.tsx`, `apps/web/src/components/AccountEditor.tsx`.

### Movimientos
- **Confirmado**: Quick Entry crea gasto/ingreso/transferencia; Movimientos lista, filtra, edita y elimina; transferencias internas se modelan como dos transacciones con `transferId`.
- **Decisión**: `Transaction.monto` siempre positivo; el efecto en saldo depende de `tipo`.
- **Rutas/archivos**: `apps/api/src/transactions/createTransaction.ts`, `apps/api/src/movements/*`, `apps/api/src/quick-entry/*`, `apps/web/src/QuickEntry.tsx`, `apps/web/src/MovementsPage.tsx`.

### Metas
- **Confirmado**: CRUD, cambio de estado, eliminación segura y progreso desde saldo de cuenta asociada.
- **Decisión**: `Goal` no guarda monto ahorrado; el avance se deriva de `account.saldo / montoObjetivo`.
- **Rutas/archivos**: `apps/api/src/goals/*`, `apps/web/src/GoalsPage.tsx`, `packages/shared-types/src/index.ts`.

### Compromisos
- **Confirmado**: instancias mensuales, plantillas recurrentes, generación automática desde plantillas activas, pago con creación de `Transaction`, reversa segura solo si hay transacción vinculada.
- **Decisión**: índice único `(templateId, anio, mes)` + `createMany(..., skipDuplicates: true)` evita duplicados; pagados no se editan/eliminan directamente.
- **Rutas/archivos**: `apps/api/src/commitments/*`, `apps/api/src/commitment-templates/*`, `apps/web/src/CommitmentsPage.tsx`.

## 3. Preguntas abiertas y resoluciones

**a. Compromisos legacy no reversibles.** Hay una nota histórica sobre compromisos pagados legacy locales sin `paymentTransactionId`; no se revalidó la base local en este corte de documentación. Si ese dump será base de uso real, hace falta migración manual o explicación UI; hoy la UI solo bloquea reversa automática mediante `canRevertPayment`.

**b. Edición de `CommitmentTemplate` a mitad de mes.** **Resuelto y validado visualmente por el usuario.** La instancia ya generada **queda con valores antiguos**. `updateCommitmentTemplate()` solo actualiza `commitmentTemplate` y el test `edits a template without mutating already generated commitments` verifica que no llama `findMany/createMany/update` de commitments. En `getCommitments()`, `generateCommitmentsFromActiveTemplates()` solo crea faltantes; no sincroniza existentes. `GET /commitments` expone `templateId` en el DTO de lectura para que Web detecte si un compromiso visible pertenece a la plantilla editada. En `apps/web/src/CommitmentsPage.tsx`, al guardar una edición de plantilla recurrente con compromiso del mes ya generado, se muestra un aviso accesible en español con `role="status"`; el aviso se descarta automáticamente a los 5 segundos y remueve el nodo del DOM, recuperando el espaciado.

**c. Accesibilidad real.** **No verificado**. Hay `aria-label`, `role=status/alert` y copias de error en español, pero no se encontró validación end-to-end del flujo Quick Entry + Commitments + errores contra criterios de lectura limitada / Android medio. Queda pendiente explícito.

## 4. Infraestructura y DX

- Monorepo pnpm: `apps/api`, `apps/web`, `packages/shared-types`; sin Turborepo.
- Scripts: API `dev`, `test`, `typecheck`, `prisma:generate`, `prisma:migrate`, `prisma:seed`; Web `dev`, `build`, `test`, `typecheck`, `preview`.
- Prisma: `apps/api/prisma.config.ts` activo; `prisma validate` OK; `migrate status`: 3 migraciones y BD local al día.
- Schema real: **6 modelos**, no 5: `Account`, `Category`, `Transaction`, `Commitment`, `CommitmentTemplate`, `Goal`.

## 5. Deuda técnica activa e historial resuelto

### Deuda técnica activa

1. Validar accesibilidad real móvil/lectura limitada con dispositivo o checklist explícito.
2. Resolver compromisos pagados legacy locales sin `paymentTransactionId` antes de usar esa BD como dato real.
3. Agregar scripts raíz si el arranque API+Web en paralelo se vuelve fricción real.
4. PWA instalable/offline pendiente si bloquea uso diario.

### Historial resuelto

- Resuelto y validado visualmente por el usuario: `apps/web/src/CommitmentsPage.tsx` muestra un aviso accesible después de guardar una plantilla recurrente cuando el compromiso del mes ya existe y no será modificado; desaparece a los 5 segundos y el espaciado se recupera.

## 6. Próximo paso único

Ejecutar una validación manual guiada en el celular principal documentado y, si es posible, una pasada adicional en Android medio para robustez móvil. Cubrir Quick Entry y Compromisos, incluyendo mensajes de error y reversa de pago, y registrar hallazgos bloqueantes antes de tocar más features.

## Evidencia ejecutada

- `pnpm --filter @finanzas-personales/api typecheck` → OK, `tsc --noEmit` sin errores.
- `pnpm --filter @finanzas-personales/api test` → **24 files passed, 272 tests passed**.
- `pnpm --filter @finanzas-personales/web typecheck` → OK, `tsc --noEmit` sin errores.
- `pnpm --filter @finanzas-personales/web test` → **6 files passed, 133 tests passed**.
- `pnpm --filter @finanzas-personales/api exec prisma validate` → schema válido.
- `pnpm --filter @finanzas-personales/api exec prisma migrate status` → 3 migraciones, database schema up to date.
