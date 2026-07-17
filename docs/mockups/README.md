# Mockups — Finanzas Personales

**Estado**: prototipos exploratorios, no producción.

## Qué son estos archivos

Cada `.jsx` en esta carpeta es la versión ejecutable de los wireframes descritos en `../diseno_ui_finanzas_personales.md`. Se usaron para validar layout, flujo de interacción y cantidad de taps antes de escribir cualquier línea de código de producción. Todos usan **datos hardcodeados** (mock) — ninguno se conecta a Prisma, a la API, ni a `packages/shared-types`.

**No son la fuente de verdad del código.** La implementación real vive en `apps/web/src` y usa los tipos generados por Prisma. Si algo acá difiere de lo que terminó implementado, gana la implementación — actualizar este README o los mockups es opcional, no obligatorio, cuando eso pase.

## Índice

| Archivo | Pantalla | Qué valida |
|---|---|---|
| `01-dashboard.jsx` | Dashboard principal | Layout de disponible/patrimonio/metas/últimos movimientos; cálculo de progreso de metas desde `saldo` de cuenta |
| `02-ingreso-rapido.jsx` | Ingreso rápido de movimiento | Flujo de tipo→cuenta→categoría en el menor número de taps posible; caso especial de Transferencia (Desde/Hacia) |
| `03-compromisos.jsx` | Compromisos mensuales | Orden por urgencia, total pendiente, y el flujo de "marcar pagado" generando el movimiento asociado automáticamente |
| `04-gestion-cuentas.jsx` | Gestión de cuentas | Agrupación por tipo, cuentas inactivas colapsadas, edición de saldo directo, y advertencia al desactivar una cuenta con meta activa asociada |
| `05-metas.jsx` | Seguimiento de metas | Atajo "Agregar a esta meta" con cuenta destino fija, y creación de cuenta dedicada al vuelo desde el editor de meta |
| `06-movimientos.jsx` | Listado con filtros | Agrupación por día, filtros de cuenta/período/categoría, y transferencias fusionadas visualmente en una sola línea |
| `07-prestamos.jsx` | Préstamos por cobrar | Acceso desde la tarjeta persistente del Dashboard y desde Ingreso rápido; flujo separado para entregar préstamo o registrar devolución, saldo pendiente derivado, estados y auditoría de devoluciones |

## Decisiones de diseño ya validadas acá

Estos mockups ya reflejan las decisiones cerradas en la sección 8 de `diseno_ui_finanzas_personales.md`:

1. Sin barra de "presupuesto mensual" — el disponible es un número absoluto.
2. Transferencias se guardan como `GASTO`/`INGRESO` vinculados por `transferId`, excluidos del cálculo de ingresos/gastos del mes.
3. "Marcar pagado" en un compromiso genera automáticamente el `Transaction` asociado.
4. Recurrentes con `CommitmentTemplate` pausable (ver `schema.prisma`), para casos como una suscripción que se contrata solo algunos meses.
5. Atajo directo "Agregar a esta meta" sin tener que buscar la cuenta destino entre todas las demás.

## Convenciones al agregar un mockup nuevo

- Numerar con prefijo de dos dígitos según el orden en que aparece en el flujo de navegación (`07-`, `08-`, ...).
- Un solo archivo por pantalla, `export default` del componente principal.
- Datos mock declarados arriba del componente, comentados si simulan una relación con otra entidad (ej. `METAS_ACTIVAS` simulando `Goal` filtrado por `accountId`).
- Si el mockup revela una decisión de diseño o de schema que faltaba cerrar, esa decisión se documenta en `diseno_ui_finanzas_personales.md`, no acá — este README es un índice, no el lugar donde se registran decisiones.
- Para `07-prestamos.jsx`, el mockup debe validar únicamente el diseño aprobado del primer slice. No debe presentarse como implementación productiva ni asumir que `Loan`, `LoanRepayment` o la transacción de entrega ya existen en el schema o la API.
