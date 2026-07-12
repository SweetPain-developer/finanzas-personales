# Checklist de entrega V1 — Finanzas Personales

**Estado**: checklist operativo para entregar o retomar el proyecto con seguridad.  
**Última actualización**: 12 de julio de 2026.  
**Alcance**: validación local de API, Web, Prisma y flujos principales del MVP.

---

## 1. Prerrequisitos y supuestos de entorno

| Ítem | Supuesto / chequeo |
|---|---|
| Gestor de paquetes | `pnpm` disponible; el repo declara `pnpm@10.0.0`. |
| Base de datos | PostgreSQL disponible y accesible desde `apps/api/.env`. |
| Variables API | `apps/api/.env` debe definir `DATABASE_URL`; usar `apps/api/.env.example` como referencia. |
| Prisma | Configuración activa en `apps/api/prisma.config.ts`; no usar `package.json#prisma`. |
| Monorepo | Workspaces: `apps/*` y `packages/*`; API y Web se levantan por separado. |
| Alcance V1 | Uso personal/local, sin auth compleja ni conexión bancaria automática. |

---

## 2. Arranque local

| Servicio | Comando | URL esperada |
|---|---|---|
| API | `cd apps/api && pnpm dev` | `http://localhost:3001` |
| Web | `cd apps/web && pnpm dev` | `http://localhost:5173` |

**Notas rápidas**

- El proxy de Vite envía `/api` hacia `http://localhost:3001`.
- El watch mode de la API no aplica migraciones automáticamente.
- Si cambia `schema.prisma`, ejecutar checks Prisma antes de diagnosticar errores de datos/API.

---

## 3. Estado y checks Prisma

| Chequeo | Comando |
|---|---|
| Validar schema | `cd apps/api && pnpm prisma validate` |
| Revisar estado de migraciones | `cd apps/api && pnpm prisma migrate status` |
| Aplicar migraciones locales | `cd apps/api && pnpm prisma:migrate` |
| Regenerar Prisma Client | `cd apps/api && pnpm prisma:generate` |

**Migraciones esperadas**

- `20260705190651_init`
- `20260711120000_commitment_template_month_unique`
- `20260711143000_commitment_payment_transaction_link`

---

## 4. Verificación automatizada

### API

| Paso | Comando | Resultado esperado |
|---|---|---|
| Prisma validate | `cd apps/api && pnpm prisma validate` | Schema válido. |
| Prisma migrate status | `cd apps/api && pnpm prisma migrate status` | Migraciones sincronizadas con la BD local. |
| Prisma generate | `cd apps/api && pnpm prisma:generate` | Client generado sin errores. |
| Typecheck | `cd apps/api && pnpm typecheck` | Sin errores TypeScript. |
| Tests | `cd apps/api && pnpm test` | Suite verde: 24 files, 272 tests. |

### Web

| Paso | Comando | Resultado esperado |
|---|---|---|
| Typecheck | `cd apps/web && pnpm typecheck` | Sin errores TypeScript. |
| Tests | `cd apps/web && pnpm test` | Suite verde: 6 files, 133 tests. |

---

## 5. Checklist manual del MVP

### Funcional

- [ ] **Cuentas CRUD**: crear, editar, activar/desactivar y verificar actualización de saldos.
- [ ] **Movimientos CRUD**: crear gasto, ingreso, editar, eliminar y validar impacto en saldos.
- [ ] **Transferencias**: crear transferencia entre cuentas propias y confirmar que no duplica ingresos/gastos reales.
- [ ] **Dashboard**: revisar disponible para gastar, patrimonio líquido, ingresos/gastos del mes y resumen de metas.
- [ ] **Metas CRUD/status/progress**: crear, editar, pausar/reactivar/completar, eliminar y validar progreso desde cuenta asociada.
- [ ] **Compromisos CRUD**: crear, editar, eliminar y revisar estados pendiente/pagado.
- [ ] **Compromisos recurrentes**: crear/pausar/reactivar plantilla y generar compromisos del mes sin duplicados.
- [x] **Aviso al editar recurrente ya generado**: al guardar una edición de plantilla con compromiso del mes visible, se muestra aviso accesible, desaparece a los 5 segundos y el espaciado se recupera. Validado visualmente por el usuario.
- [ ] **Navegación mensual de compromisos**: moverse entre meses y validar datos correctos por período.
- [ ] **Pagar compromiso**: marcar como pagado, crear movimiento asociado y descontar saldo.
- [ ] **Revertir pago**: volver a pendiente, eliminar movimiento asociado y restaurar saldo.

### UX rápida

- [ ] El FAB de ingreso rápido no se superpone con formularios, paneles o acciones principales.
- [ ] Los botones mantienen colores semánticos: destructivo rojo, advertencia ámbar, éxito verde, acciones neutrales grises.
- [ ] Errores y estados de carga visibles están en español neutral/profesional.
- [ ] Los formularios principales se pueden completar cómodamente en vista móvil.

---

## 6. Limitaciones intencionales y follow-ups opcionales

| Tipo | Nota |
|---|---|
| Limitación intencional | Compromisos pagados legacy sin `paymentTransactionId` no son reversibles automáticamente; requieren manejo manual/seguro. |
| Resuelto | Editar una plantilla recurrente no muta compromisos ya generados; la UI avisa cuando el compromiso del mes actual conserva valores anteriores. |
| Opcional V1 | Completar PWA si bloquea uso diario: manifest, instalación móvil, iconos y offline básico. |
| Opcional UX | Pulir labels de navegación inferior si la validación móvil lo pide. |
| Opcional UX | Mejorar estados vacíos en vistas con pocos datos reales. |

---

## 7. Decisión de readiness

| Campo | Valor |
|---|---|
| Decisión | [ ] Ready / [ ] Not ready |
| Responsable |  |
| Fecha |  |
| Notas |  |

**Criterio mínimo para marcar Ready**

- [ ] Checks automatizados de API y Web ejecutados con resultado verde.
- [ ] Migraciones Prisma sincronizadas con la base local objetivo.
- [ ] Checklist manual funcional completado sin bloqueantes.
- [ ] Limitaciones conocidas aceptadas explícitamente para V1.
