# Harness — Finanzas Personales

**Propósito de este documento**: es lo primero que se usa como contexto al empezar o retomar una sesión de trabajo en este proyecto. No reemplaza a los documentos de `/docs` — los resume y les da prioridad, para que no haya que inferir decisiones que ya están cerradas.

**Por qué existe**: reduce ambigüedad y evita reabrir decisiones cerradas. Cada decisión registrada acá debe tratarse como contexto base antes de proponer cambios.

---

## 1. Qué es este proyecto (una línea)

PWA de finanzas personales para uso local de una persona, pensada para reemplazar un workflow manual de notas + asistencia conversacional + planillas. Hoy opera como producto cerrado; auth + ownership está diseñado como próximo corte antes de deploy público.

## 2. Documentos fuente de verdad — cuándo consultar cada uno

| Documento | Consultarlo cuando... |
|---|---|
| `docs/documento_base_finanzas_personales.md` | Haya dudas de alcance (¿esto es V1 o backlog?), de las 4 preguntas que la app debe responder, o del problema que se resuelve |
| `docs/diseno_ui_finanzas_personales.md` | Se esté implementando cualquier pantalla — tiene el wireframe y las reglas de UX de cada una, más las 5 decisiones cerradas en su sección 7 |
| `docs/estructura_proyecto_finanzas_personales.md` | Haya dudas de dónde va un archivo nuevo, o de por qué la estructura es la que es (y por qué no es la de `juego-cartas`) |
| `docs/schema.prisma` | Se esté escribiendo cualquier query o mutación — es la única fuente de verdad del modelo de datos, no se infiere de memoria |
| `docs/mockups/*.jsx` + `docs/mockups/README.md` | Se necesite ver el comportamiento de interacción ya validado de una pantalla, antes de reimplementarla en `apps/web/src` |
| `harness_prestamos_por_cobrar.md` | Se vaya a diseñar o implementar el módulo de Préstamos por cobrar; contiene sus decisiones cerradas, reglas contables, fases y protocolo de implementación |
| `docs/importacion/README.md` | Haya que importar o revisar datos reales locales con el flujo controlado y sus advertencias |
| `docs/diseno_auth_ownership_finanzas_personales.md` | Se vaya a implementar autenticación, ownership por `userId`, deploy público o aislamiento de datos |

**Regla dura**: si un documento de `/docs` contradice un recuerdo o una nota previa, gana el documento. Los documentos son la fuente persistente del proyecto.

## 3. Decisiones cerradas — no volver a abrir sin solicitud explícita del usuario

- Montos en `Int`, pesos chilenos, sin decimales.
- `Transaction.monto` siempre es positivo. La base de datos lo protege con constraint (`monto > 0`) y el efecto en saldo se deriva de `Transaction.tipo` en código: `GASTO` resta, `INGRESO` suma. No se usa el signo del número para interpretar la operación.
- Transferencias = 2 `Transaction` (una `GASTO`, una `INGRESO`) vinculadas por `transferId`. El cálculo de ingresos/gastos del mes **excluye** todo movimiento con `transferId` no nulo.
- `Transferencia enviada` es una categoría de `GASTO` para dinero enviado a terceros. No es una transferencia interna: se guarda como un gasto normal con `transferId: null` y sí cuenta como gasto del mes.
- `Account` representa un "bolsillo" controlado por el usuario, no necesariamente una cuenta bancaria física (ej. apartados o sobres de ahorro son cuentas `AHORRO` separadas, con prefijo genérico como `Demo - `).
- El progreso de una `Goal` se calcula 100% desde `account.saldo` de su cuenta dedicada. No existe campo `montoAhorrado` en `Goal`.
- No hay presupuesto mensual ni barra de progreso contra un tope en el dashboard — "disponible" es un número absoluto.
- Al marcar un `Commitment` como pagado, se genera automáticamente el `Transaction` tipo `GASTO` asociado. Nunca se le pide al usuario cargarlo dos veces.
- Solo los `Commitment` en estado `PENDIENTE` son editables/eliminables. Los `PAGADO` se revierten mediante el flujo explícito de marcar pendiente, no editando/eliminando directo.
- Revertir pago / marcar pendiente restaura saldo, elimina el `Transaction` de pago vinculado y vuelve el compromiso a `PENDIENTE`. El contrato `canRevertPayment` evita reversas automáticas de compromisos legacy pagados sin `paymentTransactionId`.
- Recurrentes variables (se activan o no según el mes) usan `CommitmentTemplate` — separa la plantilla de la instancia mensual. Ver schema para el modelo exacto.
- La generación recurrente de `Commitment` está protegida por índice único `(templateId, anio, mes)` y `createMany(..., skipDuplicates: true)`. La migración que lo aplica es `20260711120000_commitment_template_month_unique` y deduplica antes de crear el índice.
- Editar un `CommitmentTemplate` no muta compromisos ya generados. `GET /commitments` expone `templateId` en el DTO de lectura para que Web pueda detectar compromisos visibles originados en la plantilla editada.
- Si se edita una plantilla recurrente y el compromiso del mes visible ya existe, Web muestra un aviso accesible en español; el aviso desaparece a los 5 segundos, remueve el nodo del DOM y recupera el espaciado. Este comportamiento fue validado visualmente durante la revisión del proyecto.
- El script de desarrollo de API usa `tsx watch src/server.ts`; aun así, después de cambios de schema corresponde aplicar la migración Prisma antes de diagnosticar errores de runtime.
- Prisma se configura en `apps/api/prisma.config.ts`; no usar el bloque deprecated `package.json#prisma`.
- Estándar UX aplicado: acciones múltiples en tarjetas van en fila horizontal inferior; eliminar rojo, pausar/desactivar/marcar pendiente ámbar, activar/reactivar/confirmar/marcar pagado verde, editar/cancelar/limpiar filtros neutral.
- En `Movimientos`, el FAB se oculta durante detalle/edición para no bloquear acciones del formulario.
- Estructura de repo: monorepo simplificado con workspaces (npm/pnpm), **sin Turborepo**. `apps/web`, `apps/api`, `packages/shared-types`.
- Stack: React + TypeScript, Node.js + Express, PostgreSQL + Prisma, PWA. Auth no está implementado; el diseño aprobado es `User + userId` ownership, JWT firmado en cookie HTTP-only, `argon2id`, usuario inicial/backfill vía `INITIAL_USER_EMAIL`, producto cerrado y sin registro público en el primer slice.
- UI implementada con CSS real propio, sin Tailwind ni UI kit por ahora. No agregar librerías de estilos sin aprobación explícita.
- Navegación actual: estado local simple en `App`, sin router ni state manager. No agregar router/state manager hasta que el flujo lo justifique.

## 4. Qué NO hacer (aunque parezca una mejora razonable)

- No agregar Turborepo, ni pipelines de build entre paquetes. Ya se evaluó y se descartó — ver sección 3.
- No implementar gráficos de análisis, conexión automática a bancos, multi-usuario público, notificaciones ni exportación de datos sin decisión explícita. La importación real local ya existe como flujo controlado; no convertirla en importación pública/general sin nuevo diseño.
- No agregar librerías nuevas (de estado global, UI kit, etc.) sin aprobación explícita del usuario. El stack ya está cerrado.
- No inventar campos nuevos en el schema de Prisma sin señalarlo como una propuesta explícita — el schema es la fuente de verdad, cambiarlo es una decisión del usuario, no del modelo.
- No saltarse el enfoque de "datos hardcodeados primero": ninguna pantalla nueva se conecta a la API real antes de validar su layout con datos mock, siguiendo el mismo patrón que los archivos de `docs/mockups/`.
- No asumir que el usuario final tiene necesidades de accesibilidad especiales; cualquier contexto externo a este proyecto debe verificarse antes de aplicarlo.

## 5. Fase actual

**Fase 0 (documentación y diseño): completa.** Documento base, diseño de UI de las 6 pantallas, schema de Prisma, estructura de proyecto y mockups exploratorios en `docs/mockups/` — todo cerrado y consistente entre sí.

**Fase 1 (MVP funcional): en curso.** Objetivo: reemplazar Obsidian completamente durante 1 mes de uso real.

### Estado real implementado al 12 jul 2026

Ya está implementado:

1.  Estructura real del monorepo (`apps/web`, `apps/api`, `packages/shared-types`) con pnpm.
2.  Dashboard real conectado a API/Prisma, con CSS real y sin Tailwind.
3.  Postgres local con Docker, Prisma migrate, seed y constraint `transactions.monto > 0`.
4.  `GET /dashboard` con cálculos desde Prisma y exclusión de transferencias internas por `transferId != null`.
5.  Ingreso rápido basado en `docs/mockups/02-ingreso-rapido.jsx`, con opciones desde API y guardado real mediante `POST /transactions`.
6.  `GET /quick-entry/options` para cuentas activas, categorías por tipo y última cuenta usada.
7.  Listado de movimientos (`GET /movements` + pantalla `Movimientos`) con filtros por mes/cuenta/categoría, agrupación por fecha y transferencias internas fusionadas visualmente por `transferId`.
8.  Cuentas CRUD completo, agrupadas por tipo e inactivas separadas.
9.  **Módulo de Metas (V1 funcional)**:
    - Listado, creación, edición, eliminación segura y cambios de estado implementados.
    - Validación de cuenta asociada: solo cuentas activas de tipo `AHORRO` o `RESERVA`.
    - Progreso calculado desde `account.saldo / montoObjetivo`; crear/editar/eliminar/cambiar estado no muta saldos ni transacciones.
    - UI clarifica `Monto objetivo` vs progreso actual; el progreso sube transfiriendo dinero a la cuenta asociada.
    - Notas: omitir `notas` preserva el valor existente; enviar vacío/null las limpia.
    - Ciclo de estado: `ACTIVA` puede pausarse/completarse; `PAUSADA` puede reactivarse; `COMPLETADA` no expone acciones de ciclo en este corte.
10. **Módulo de Compromisos (V1 operativo completo)**:
    - **Instancias mensuales (`Commitment`)**:
        - Listado (`GET /commitments?month=...`) con navegación/selector de mes y generación automática de instancias `PENDIENTE` faltantes desde plantillas activas para el mes seleccionado.
        - Creación (`POST /commitments`) de compromisos `PENDIENTE`; acepta `month` opcional y valida que `fechaVencimiento` pertenezca al mes seleccionado. El default histórico sigue siendo `2026-07`.
        - Edición y eliminación de compromisos `PENDIENTE`; edición también acepta `month` opcional con la misma validación de fecha.
        - Flujo de pago completo: marcar `PENDIENTE` como `PAGADO` tras confirmar cuenta/categoría, generando el `Transaction` de `GASTO` asociado y actualizando el saldo de la cuenta de forma atómica.
        - Reversa de pago / marcar pendiente implementada: restaura saldo, elimina la transacción vinculada y vuelve a `PENDIENTE`.
        - Contrato seguro `canRevertPayment`: compromisos legacy pagados sin `paymentTransactionId` no son auto-reversibles.
        - Protección contra edición/eliminación directa de compromisos `PAGADO`.
        - Guardia contra respuestas obsoletas: el mes seleccionado más reciente impide que datos/errores de requests anteriores sobrescriban la vista actual.
    - **Plantillas (`CommitmentTemplate`)**:
        - CRUD y activación/desactivación de plantillas desde la UI de "Recurrentes".
        - Generación recurrente con prevención de duplicados mediante único `(templateId, anio, mes)` y `skipDuplicates`.
        - Edición de plantilla sin mutación retroactiva de compromisos ya generados.
    - Aviso accesible al editar una plantilla cuando el compromiso del mes visible ya existe; validado visualmente durante la revisión del proyecto.
    - **Pulido de UI**: selector de mes, botones alineados, mensajes de estado, avisos de policy y selectores opcionales implementados.
11. Dev UX de API: `apps/api` corre en watch mode con `tsx watch src/server.ts` para evitar procesos stale durante desarrollo.
12. Configuración Prisma migrada a `apps/api/prisma.config.ts`; eliminado el bloque deprecated `package.json#prisma`.
13. Estándares UX de acciones aplicados; el aviso de edición de plantilla recurrente fue validado visualmente durante la revisión del proyecto.
14. Importador controlado de datos reales implementado y testeado; importación local real ejecutada correctamente tras backup y confirmación explícita.
15. Repo inicializado y publicado en GitHub `origin/main` con commit `7ae4f07` (`chore: initial project setup`), manteniendo ignorados `.env`, workbooks, backups, `.atl`, `.opencode`, `node_modules` y `dist`.
16. Documentación, tests, seeds y mockups públicos sanitizados con datos demo/genéricos.

### Datos locales post-importación

Conteos de validación local: 8 cuentas, 18 categorías, 58 movimientos, 8 plantillas de compromiso, 9 compromisos y 4 metas.

Advertencias conocidas: algunos registros usan fecha técnica `2026-07-01`; campos opcionales de vencimiento o pago pueden quedar en `null`. No inferir fechas reales a partir de ese fallback.

Nota de producto validada: el dashboard calcula disponible como balance operativo global, no como disponible específico de una cuenta.

### Próxima tarea concreta

Siguiente corte explícito: implementar **Slice 1: schema + seed con ownership** según `docs/diseno_auth_ownership_finanzas_personales.md`. No escribir código antes de revisar el plan del slice; no hay deploy público ni exposición fuera del entorno local hasta que auth + ownership estén implementados y verificados.

### Backlog explícito — no dar por hecho

- Movimientos: swipe real, búsqueda y scroll infinito.
- PWA: manifest, instalación móvil, iconos y offline básico si hace falta.
- Dev UX: agregar scripts raíz para levantar web + API juntos; para cambios de schema, aplicar migraciones Prisma antes de validar la API.

## 6. Cómo proceder ante ambigüedad

Si una instrucción del usuario no especifica algo que este harness o los documentos de `/docs` tampoco cubren:

1. **No asumir y avanzar.** Una asunción incorrecta cuesta más corregirla después que preguntar antes.
2. Proponer 1-2 opciones concretas y concisas, indicando cuál sería la más consistente con las decisiones ya cerradas (sección 3) y por qué.
3. Si la ambigüedad es menor y de bajo riesgo de retrabajo (ej. nombre de una variable), elegir la opción más simple y decirlo explícitamente en una línea, sin bloquear el avance por eso.

## 7. Disciplina de planificación

Para cambios estructurales, se recomienda **forzar el paso por cada fase de forma explícita** en vez de saltar directo a implementar:
- Especificar la tarea puntual (qué pantalla/módulo, con qué mockup o sección del diseño de UI como referencia) antes de plantear el plan técnico.
- Plantear el plan (qué archivos se tocan, qué se reutiliza de `shared-types`) antes de generar tareas.
- Recién ahí generar las tareas de implementación concretas.

Esto es más lento por sesión, pero reduce el riesgo de saltarse una decisión ya cerrada (sección 3) por intentar resolver todo en un solo paso.
