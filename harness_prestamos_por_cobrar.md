# Harness — Préstamos por cobrar

**Estado**: diseño aprobado, implementación pendiente.

Este documento es la guía técnica específica para implementar el módulo de dinero por cobrar. Complementa a `harness_finanzas_personales.md`; no reemplaza el schema ni los documentos de diseño. Sus decisiones cerradas no deben reabrirse sin solicitud explícita.

## Propósito

Un préstamo por cobrar representa dinero entregado a otra persona que se espera recuperar. **No es un gasto ni un ingreso ordinario**: la entrega reduce una cuenta propia y crea un derecho de cobro; la devolución aumenta una cuenta propia y reduce ese derecho.

## Referencias y precedencia

- Diseño UI aprobado: [`docs/diseno_ui_finanzas_personales.md`](docs/diseno_ui_finanzas_personales.md), sección **7. Préstamos por cobrar**.
- Referencia visual: [`docs/mockups/07-prestamos.jsx`](docs/mockups/07-prestamos.jsx).
- El mockup es **exploratorio**, autocontenido y sin API/Prisma. Cuando exista código real, gana el código real conforme a schema, tests y contratos aprobados; el mockup no autoriza inventar campos ni copiar su estado local.
- Antes de tocar persistencia, consultar también `docs/schema.prisma` y el diseño de auth/ownership.

## Decisiones cerradas

| Área | Regla obligatoria |
|---|---|
| Efecto de la entrega | Reduce `Account.saldo` de la cuenta origen. |
| Efecto de la devolución | Aumenta `Account.saldo` de la cuenta destino. |
| Métricas ordinarias | Entrega y devolución se excluyen de ingresos y gastos ordinarios. No usar `transferId`: no es una transferencia entre cuentas propias. |
| Cuentas permitidas | Solo cuentas activas `OPERATIVA`, `AHORRO` o `RESERVA`. Excluir `DEUDA` y `CMR` como origen y destino. |
| Límites | La entrega no puede superar el saldo de la cuenta origen. La devolución no puede superar el saldo pendiente derivado. |
| Personas | Múltiples préstamos por persona. Cada nueva entrega crea un `Loan` independiente. En el primer slice, la persona es texto obligatorio; no hay catálogo de contactos. |
| Persistencia conceptual | `Loan` + transacción de entrega + `LoanRepayment` por cada devolución. El saldo pendiente se deriva del monto entregado menos la suma de devoluciones; no usar un monto devuelto mutable como fuente de verdad. |
| Estados | `PENDIENTE`, `SALDADO`, `INCOBRABLE`. El préstamo queda `SALDADO` cuando el saldo derivado llega a cero. |
| Incobrable | `INCOBRABLE` no restaura saldo ni crea transacción. Puede volver a `PENDIENTE` sin mutación financiera; no aplica a `SALDADO`. |
| Corrección | Anular o editar solo un préstamo sin devoluciones. Con devoluciones, no modificar de forma que se rompa el historial. |
| Acceso | Dashboard: tarjeta **Por cobrar**, que suma solo `PENDIENTE`. Ingreso rápido: tipo **Préstamo**, con entregar y registrar devolución. No agregar un sexto botón al bottom navigation. |
| Auditoría | Conservar historial de cada devolución: fecha, monto y cuenta destino. |

## Reglas contables y métricas

| Operación | `Account.saldo` | `availableToSpend` | `liquidNetWorth` | `monthlyIncome` / `monthlyExpenses` |
|---|---|---|---|---|
| Entrega desde `OPERATIVA` | Disminuye | Disminuye por el monto, según la cuenta operativa afectada | Disminuye porque baja el saldo líquido | Sin efecto en ambas métricas |
| Entrega desde `AHORRO`/`RESERVA` | Disminuye | Sin efecto si el cálculo usa solo `OPERATIVA` | Disminuye porque baja el saldo líquido | Sin efecto en ambas métricas |
| Devolución a `OPERATIVA` | Aumenta | Aumenta por el monto, según la cuenta operativa afectada | Aumenta porque sube el saldo líquido | Sin efecto en ambas métricas |
| Devolución a `AHORRO`/`RESERVA` | Aumenta | Sin efecto si el cálculo usa solo `OPERATIVA` | Aumenta porque sube el saldo líquido | Sin efecto en ambas métricas |
| Marcar `INCOBRABLE` / volver a `PENDIENTE` | Sin cambio | Sin cambio | Sin cambio | Sin efecto en ambas métricas |

La entrega y la devolución son movimientos financieros de cuentas, pero no son ingresos/gastos ordinarios. No sumar el derecho de cobro al `liquidNetWorth`: el primer slice no incorpora patrimonio total ni redefine esa métrica. La tarjeta **Por cobrar** es informativa y cuenta únicamente saldos `PENDIENTE`.

## Alcance por fases

1. **Mockup aprobado**: usar `docs/mockups/07-prestamos.jsx` para validar el flujo visual exploratorio; ya no es requisito seguir puliéndolo antes de implementar.
2. **Schema y migración**: diseñar `Loan`, la relación/transacción de entrega y `LoanRepayment` con ownership; actualizar schema, migración y documentación juntas. Definir nombres y relaciones reales sin inferirlos del mockup.
3. **API**: contratos, validaciones de cuentas/saldos/estado, cálculo derivado e invariantes; operaciones financieras atómicas y aisladas por `userId`.
4. **Quick Entry/Web**: entregar y registrar devolución desde Ingreso rápido; tarjeta Dashboard, listado, detalle e historial; sin sexto bottom-nav.
5. **Tests y verificación**: cubrir reglas contables, límites, estados, historial, exclusión de métricas, ownership, atomicidad y migración. Verificar contra este harness, diseño, schema y contratos.

## No objetivos y riesgos

### No objetivos del primer slice

- No reutilizar **Transferencia enviada**.
- No crear una categoría genérica para representar préstamos.
- No incluir intereses, cuotas, vencimientos, recordatorios, contactos, múltiples entregas dentro del mismo préstamo ni patrimonio total.

### Riesgos y guardas

- No usar un campo mutable de “monto devuelto” como fuente de verdad; derivar desde `LoanRepayment`.
- `userId`/ownership es obligatorio en todos los registros y consultas; no dejar datos globales por conveniencia.
- Entrega, transacción asociada, saldo de cuenta y creación del préstamo deben ser atómicos. La devolución, su `LoanRepayment`, saldo destino y cambio de estado también.
- No tocar ni modelar deuda CMR como cuenta válida del préstamo.
- No contar ninguna operación de préstamo como ingreso o gasto mensual, aunque el registro físico sea una transacción.

## Protocolo antes de implementar

- [ ] Leer este harness completo.
- [ ] Leer `harness_finanzas_personales.md`, la sección 7 de `docs/diseno_ui_finanzas_personales.md` y `docs/mockups/07-prestamos.jsx`.
- [ ] Revisar `docs/schema.prisma`, migraciones relevantes y el diseño de auth/ownership.
- [ ] No inventar campos: si falta una decisión de persistencia, detenerse y documentar la propuesta.
- [ ] Actualizar documentación, schema y migración en el mismo corte cuando corresponda.
- [ ] Construir y validar datos mock primero antes de conectar API real.
- [ ] Verificar tests, typecheck y migración en la fase correspondiente; no declarar terminado por una validación visual del mockup.

## Estado de entrega

**Diseño aprobado. Implementación pendiente.** Este harness no declara que `Loan`, `LoanRepayment`, API, UI productiva o migraciones ya existan.

## Contrato API implementado

Los endpoints requieren la sesión autenticada; el `userId` siempre se obtiene de la sesión y cualquier `userId` enviado por el cliente se ignora.

| Endpoint | Payload mínimo | Respuesta mínima |
|---|---|---|
| `POST /loans` | `{ persona, montoEntregado, accountId, fecha?, descripcion?, notas? }` | `201 { loan }` |
| `GET /loans` | `estado?` (`PENDIENTE`, `SALDADO`, `INCOBRABLE`) | `200 { loans, summary: { pendingLoansTotal, pendingLoansCount } }` |
| `GET /loans/:id` | — | `200 { loan }` |
| `POST /loans/:id/repayments` | `{ monto, accountId, fecha?, descripcion?, notas? }` | `201 { repayment }` |
| `PATCH /loans/:id` | Uno o más de `persona`, `montoEntregado`, `accountId`, `fecha`, `descripcion`, `notas` | `200 { loan }` |
| `PATCH /loans/:id/status` | `{ estado: "PENDIENTE" | "INCOBRABLE" }` | `200 { loan }` |
| `DELETE /loans/:id` | — | `204` |

### Matriz de errores

| Estado | Casos contractuales |
|---|---|
| `400` | Payload inválido, fecha/monto/persona inválidos, cuenta no activa/elegible, sobre-saldo, estado o filtro inválido |
| `401` | Sesión ausente o inválida |
| `404` | Préstamo inexistente para el usuario autenticado |
| `409` | Transición inválida, devolución sobre préstamo no pendiente, edición/anulación con devoluciones, conflicto concurrente o cuenta loan-linked inactiva/no elegible |

Las operaciones financieras usan transacciones Prisma `Serializable`. El runtime requiere que la migración de Loans esté aplicada; no se agrega una precondición de startup y esta fase no ejecuta migraciones ni DDL.
