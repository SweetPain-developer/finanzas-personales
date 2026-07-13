# Diseño de UI — App de Finanzas Personales

**Proyecto**: Finanzas Personales
**Fecha**: 04 de julio de 2026
**Autor**: Equipo del proyecto
**Estado**: Diseño actualizado con estado V1 funcional al 12 de julio de 2026
**Base**: `documento_base_finanzas_personales.md` + `schema.prisma`

> Nota de privacidad: todos los nombres de cuentas, montos, compromisos y metas usados en wireframes son ejemplos ficticios.

---

## 0. Principios de diseño

Antes de entrar pantalla por pantalla, estos son los criterios que van a validar cada decisión de UI:

1. **Ingreso de movimiento < 10 segundos.** Esta es la métrica que define si la app reemplaza a Obsidian o no. Todo lo demás es secundario frente a esto.
2. **Mobile-first, un solo pulgar.** Uso real en celular, en movimiento (comprando, en el auto, en el trabajo). El dispositivo principal documentado es iPhone; cuando se mencione Android medio, debe entenderse como validación de robustez móvil adicional, no como cambio de dispositivo principal. Los controles principales van en el tercio inferior de la pantalla.
3. **Funcional > bonito.** El documento base es explícito: "funcional es suficiente para V1". No hay presupuesto de tiempo para pulir visualmente — cada hora en polish visual es una hora menos en el gate de validación del mes 1.
4. **Cero fricción de decisión.** Cada campo que la app puede prellenar (cuenta más usada, categoría más probable, fecha de hoy) debe prellenarse. El usuario solo corrige, no completa desde cero.
5. **Un solo usuario, cero necesidad de estados de permisos/roles.** No hay que diseñar para "quién puede ver qué" — simplifica mucho el modelo de navegación.

### Estructura de navegación

PWA con bottom navigation (patrón estándar Android, pulgar-friendly):

```
┌─────────────────────────────┐
│                             │
│      (contenido pantalla)   │
│                             │
│                             │
│                             │
│                             │
│              [+]            │ ← FAB flotante, ingreso rápido
│  ┌───┬───┬───┬───┬───┐      │
│  │ 🏠│ 📋│ 💳│ 🎯│ ⚙️│      │
│  └───┴───┴───┴───┴───┘      │
│ Dash Mov Cta Meta Compr      │
└─────────────────────────────┘
```

El botón `+` (FAB) está pensado como acceso frecuente al ingreso rápido. Excepción implementada: en `Movimientos`, se oculta durante detalle/edición para no bloquear visualmente acciones del formulario como cancelar o guardar.

### Estándar visual de acciones aplicado

| Acción | Color semántico |
|---|---|
| Eliminar | Rojo |
| Pausar, desactivar, marcar pendiente | Ámbar |
| Activar, reactivar, confirmar, marcar pagado | Verde |
| Editar, cancelar, limpiar filtros | Neutral |

Cuando una tarjeta tiene múltiples acciones, se agrupan en una fila horizontal inferior. Esto ya aplica como estándar para tarjetas de cuentas, metas, movimientos y compromisos.

---

## 1. Dashboard principal

### Propósito
Responder de un vistazo las preguntas 1, 2 y 3 del documento base: ¿cuánto puedo gastar hoy?, ¿cómo voy con mis metas?, ¿en qué estoy gastando más?

### Wireframe

```
┌─────────────────────────────┐
│  Finanzas          jul 2026 │
├─────────────────────────────┤
│                             │
│   DISPONIBLE PARA GASTAR     │
│                             │
│      $ 123.450               │
│                             │
│   ▓▓▓▓▓▓▓▓░░░░░  68%         │
│   de $200.000 (mes)          │
│                             │
├─────────────────────────────┤
│ Patrimonio líquido           │
│ $ 456.780                    │
│ ↑ +$12.300 vs mes anterior   │
├─────────────────────────────┤
│ Ingresos      Gastos         │
│ $300.000      $176.550       │
├─────────────────────────────┤
│ METAS                  ver → │
│ 🏖️ Meta de viaje             │
│ ▓▓▓▓▓░░░░░  45% $90k/$200k   │
│ 🛟 Reserva emergencia         │
│ ▓▓▓▓▓▓▓░░░  70% $140k/$200k  │
├─────────────────────────────┤
│ ÚLTIMOS MOVIMIENTOS    ver → │
│ 🍔 Alimentación  -$4.200     │
│    hoy · Cuenta principal    │
│ 💰 Ingreso      +$300.000    │
│    01 jul · Cuenta principal │
│ 🚗 Transporte    -$12.000    │
│    30 jun · Cuenta principal │
└─────────────────────────────┘
```

### Componentes y lógica de datos

| Componente | Fuente | Cálculo |
|---|---|---|
| Disponible para gastar | `Account` (tipo OPERATIVA) + `Commitment` (mes actual) | `Σ saldo(cuentas OPERATIVA) − Σ monto(commitments PENDIENTE, mes/año actual)` |
| Barra de progreso disponible | — | Opcional V1.1: requiere definir un "presupuesto mensual" que hoy no existe en el schema. **Para V1, mostrar el monto sin barra**, o usar como referencia el gasto total del mes anterior (ver nota de riesgo abajo). |
| Patrimonio líquido | `Account` (todas activas) | `Σ saldo(todas las cuentas activas)`, restando `DEUDA` |
| Ingresos / Gastos del mes | `Transaction` | `Σ monto` filtrado por `tipo` y `fecha` dentro del mes actual, excluyendo `TRANSFERENCIA` |
| Metas | `Goal` (estado ACTIVA) | Progreso = `account.saldo / goal.montoObjetivo`, se listan máx. 2-3, con link a pantalla completa |
| Últimos movimientos | `Transaction` | Últimos 3-5 por `fecha` desc, mostrando ícono de categoría, monto con signo, cuenta |

### ⚠️ Riesgo de diseño a resolver

El schema **no tiene un campo de "presupuesto mensual"** en ninguna entidad. La pregunta 1 del documento base ("¿cuánto puedo gastar hoy?") asume una barra de progreso contra algo, pero hoy el cálculo de "disponible" es un número absoluto, no relativo a un límite. Dos opciones:

- **A (recomendada para V1)**: mostrar solo el número absoluto, sin barra de progreso. Simple, no requiere schema nuevo.
- **B**: agregar un campo `presupuestoMensual` a nivel de configuración global (nueva tabla `Settings` o campo suelto). Aporta la barra visual pero es scope adicional no contemplado en el schema actual.

Sugiero cerrar esto antes de construir el dashboard — es una decisión de una línea de schema pero cambia la UI.

### Estados
- **Vacío** (primera vez, sin cuentas cargadas): CTA único "Agrega tu primera cuenta" → lleva a Gestión de cuentas.
- **Sin movimientos del mes**: Dashboard muestra saldos pero sección "últimos movimientos" con mensaje "Sin movimientos este mes".

---

## 2. Ingreso rápido de movimiento

Esta es la pantalla más importante del producto. Si toma más de 10 segundos, el proyecto no cumple su propósito.

### Flujo optimizado (objetivo: 3 taps + 1 monto)

```
┌─────────────────────────────┐
│  ✕              Guardar  ✓  │
├─────────────────────────────┤
│                             │
│   [ Gasto ] [Ingreso] [⇄]    │ ← selector tipo, GASTO preseleccionado
│                             │
│        $ ____________        │ ← teclado numérico abre automático
│                             │
├─────────────────────────────┤
│  Cuenta                      │
│  ● Principal  ○ Ahorro       │ ← chips horizontales, última usada
│  ○ Crédito  ○ Secundaria      │    preseleccionada por defecto
├─────────────────────────────┤
│  Categoría                   │
│  🍔  🚗  🧾  🎮  🛠️  💡      │ ← grid de íconos, sin texto
│  Delivery Auto Cta Ent Mant  │    para elegir rápido con el pulgar
│  📱  💵  📦                   │
│  Susc Efec Otro               │
├─────────────────────────────┤
│  Descripción (opcional)      │
│  [___________________]       │
├─────────────────────────────┤
│  hoy · 04 jul               │ ← fecha preseleccionada = hoy,
│                              │   tap para cambiar
└─────────────────────────────┘
```

### Reglas de UX que hacen el flujo rápido

1. **Tipo preseleccionado = GASTO** (es el 90%+ de los movimientos según el uso real descrito). Ingreso y Transferencia son un tap adicional.
2. **Cuenta preseleccionada = última cuenta usada**, no la primera de la lista. Reduce a cero taps en el caso común (mismo día, misma billetera).
3. **Categoría en grid de íconos sin scroll** — las categorías de gasto principales deben estar visibles y ser fáciles de tocar con el pulgar. V1 incluye una categoría adicional, `Transferencia enviada`, para dinero enviado a terceros.
4. **Descripción es opcional.** El monto + categoría + cuenta ya son suficientes para que el movimiento sea útil en reportes. Forzar descripción agrega fricción sin agregar valor proporcional.
5. **Fecha por defecto = hoy**, con tap opcional para cambiar (cubre el caso de "se me olvidó anotar ayer").
6. **Guardar queda habilitado apenas hay monto + cuenta + categoría** (para GASTO/INGRESO). Todo lo demás es opcional.

### Caso especial: Transferencia

Al tocar el ícono `⇄`, el formulario cambia de "Categoría" a "Cuenta destino":

```
┌─────────────────────────────┐
│  ✕              Guardar  ✓  │
├─────────────────────────────┤
│   [Gasto] [Ingreso] [ ⇄ ]    │ ← Transferencia seleccionada
│                             │
│        $ ____________        │
├─────────────────────────────┤
│  Desde                       │
│  ● Principal  ○ Ahorro       │
├─────────────────────────────┤
│  Hacia                       │
│  ○ Principal  ● Ahorro       │ ← no puede repetir la cuenta "Desde"
├─────────────────────────────┤
│  Descripción (opcional)      │
└─────────────────────────────┘
```

Al guardar una transferencia interna, el backend crea **2 registros `Transaction`** vinculados por el mismo `transferId` generado en servidor:

- salida: `tipo = GASTO`, `accountId = cuenta origen`, `monto > 0`
- entrada: `tipo = INGRESO`, `accountId = cuenta destino`, `monto > 0`

Ambos movimientos quedan excluidos de ingresos/gastos reales del dashboard porque tienen `transferId` no nulo.

### Transferencia enviada a terceros

Si la persona usuaria transfiere dinero a otra persona, eso **no** usa el selector `⇄` de transferencia interna. Se registra como un `GASTO` normal con la categoría `Transferencia enviada`:

- `tipo = GASTO`
- `transferId = null`
- cuenta como gasto del mes
- resta saldo de la cuenta seleccionada

Esta distinción evita mezclar movimientos entre bolsillos propios con dinero que realmente sale del patrimonio controlado por la persona usuaria.

### Estados
- **Error de guardado** (ej. sin conexión): guardar en cola local (localStorage/IndexedDB) y reintentar — importante para PWA usada en movimiento con conexión inestable.
- **Cuenta inactiva**: no aparece en los chips de selección.

### Estado implementado al 09 jul 2026

- Pantalla real conectada a `GET /quick-entry/options`.
- Guardado real conectado a `POST /transactions` para `GASTO`, `INGRESO` y transferencia interna.
- `Transaction.monto` siempre se envía positivo; el backend deriva el efecto en saldo desde `tipo`.
- Fechas enviadas como `YYYY-MM-DD` o ISO datetime con `T`; formatos no ISO se rechazan.

---

## 3. Listado de movimientos con filtros

### Propósito
Responder la pregunta 3 (¿en qué estoy gastando más?) y servir de auditoría/revisión de lo cargado.

### Wireframe

```
┌─────────────────────────────┐
│  Movimientos                │
├─────────────────────────────┤
│ [Todas ▾] [Este mes ▾] [🔍] │ ← filtros: cuenta, período, categoría
├─────────────────────────────┤
│ HOY                          │
│ 🍔 Alimentación  -$4.200     │
│    Cuenta principal          │
│ ─────────────────────────── │
│ 01 JUL                       │
│ 💰 Ingreso      +$300.000    │
│    Cuenta principal          │
│ 🏠 Vivienda      -$120.000   │
│    Cuenta principal          │
│ ─────────────────────────── │
│ 30 JUN                       │
│ 🚗 Transporte    -$12.000    │
│    Cuenta principal          │
│ ⇄ Transferencia -$25.000     │
│    Principal → Ahorro        │
└─────────────────────────────┘
```

### Componentes
- **Agrupación por día** (headers "HOY", "01 JUL", etc.) — más legible que una lista plana.
- **Filtro de cuenta**: dropdown con todas las cuentas activas + "Todas".
- **Filtro de período**: "Este mes" (default), "Mes anterior", "Rango personalizado".
- **Filtro de categoría**: opcional, multi-select.
- **Transferencias** se muestran con ícono `⇄` y formato "Cuenta A → Cuenta B" en vez de duplicarse como dos líneas separadas — aunque en la base de datos sean 2 registros, en la UI deben fusionarse visualmente por `transferId`.
- **Tap en un movimiento** → abre detalle/edición (mismo formulario del ingreso rápido, precargado).
- **Swipe para eliminar** (patrón común en apps de gastos, natural en Android).

### Estados
- **Sin resultados con filtro activo**: "No hay movimientos con estos filtros" + botón para limpiar filtros.
- **Lista larga**: paginación infinita (scroll) en vez de paginado numerado, más natural en mobile.

### Estado implementado al 11 jul 2026

- `GET /movements?month=YYYY-MM&accountId=...&categoryId=...`.
- Pantalla `Movimientos` conectada a API.
- Agrupación por fecha y filtros iniciales por mes/cuenta/categoría.
- Transferencias internas fusionadas visualmente por `transferId`, no por nombre ni categoría.
- CRUD completo de movimientos, incluyendo detalle/edición/eliminación.
- Comportamiento consciente del par de transferencia: las operaciones sobre transferencias internas respetan la relación entre ambos lados para evitar saldos inconsistentes.
- FAB oculto durante detalle/edición para no bloquear acciones del formulario.
- Pendiente opcional: swipe real, búsqueda y scroll infinito.

---

## 4. Gestión de cuentas

### Propósito
CRUD de `Account`: crear, editar saldo, activar/desactivar. Pantalla de uso poco frecuente (setup inicial + ajustes puntuales).

### Wireframe

```
┌─────────────────────────────┐
│  Cuentas              [+]   │
├─────────────────────────────┤
│ OPERATIVA                    │
│ 🏦 Principal      $150.200   │
│ 🏦 Secundaria      $12.000   │
│ 🏦 Variable            $0    │
├─────────────────────────────┤
│ AHORRO                       │
│ 💰 Ahorro          $90.000   │
├─────────────────────────────┤
│ DEUDA                        │
│ 💳 Tarjeta crédito -$60.000  │
├─────────────────────────────┤
│ RESERVA                      │
│ 🛟 Emergencia     $140.000   │
├─────────────────────────────┤
│ INACTIVAS                    │
│ 💳 Cuenta antigua (inactiva) │
└─────────────────────────────┘
```

Al tocar una cuenta:

```
┌─────────────────────────────┐
│  ✕  Editar cuenta    Guardar│
├─────────────────────────────┤
│  Nombre                      │
│  [ Principal____________]    │
│  Tipo                        │
│  [ Operativa ▾ ]              │
│  Saldo actual                │
│  [ $ 150.200 ]                │
│  Notas                       │
│  [_______________________]   │
│  Activa    [ ●━━ ]           │
│                             │
│  [ Desactivar cuenta ]        │ ← soft delete, no borra histórico
└─────────────────────────────┘
```

### Notas de comportamiento
- **Agrupación por `AccountType`** (según enum del schema: OPERATIVA, AHORRO, DEUDA, RESERVA), con las cuentas inactivas colapsadas al final.
- **Editar saldo directamente** es una decisión de diseño clave: no hay flujo de "conciliación", el usuario ajusta el número a mano cuando hace falta (ej. saldo real del banco no calza con lo registrado). Esto es coherente con "no es un sistema contable".
- **Desactivar, no eliminar**: preserva histórico de `Transaction` y `Goal` asociadas. Eliminar una cuenta con movimientos asociados debería bloquearse o advertirse explícitamente.
- **Orden manual** (`campo orden` en schema): drag-to-reorder dentro de cada grupo, opcional para V1, puede ser simplemente orden de creación al inicio.

### Estado implementado al 11 jul 2026

- `GET /accounts`.
- Pantalla `Cuentas` conectada a API.
- Cuentas activas agrupadas por tipo e inactivas separadas.
- CRUD completo: crear, editar, activar/desactivar y ajuste manual de saldo.
- Acciones de tarjeta alineadas al estándar visual aplicado: fila inferior cuando hay múltiples acciones y colores semánticos por intención.

---

## 5. Compromisos mensuales

### Propósito
Responder la pregunta 4 (¿cuánto debo y cuándo vence?).

### Wireframe

```
┌─────────────────────────────┐
│  Compromisos       jul 2026 │
├─────────────────────────────┤
│ PENDIENTES (3)   $145.000    │
│                             │
│ 🏠 Vivienda                  │
│    vence 05 jul   $120.000  │
│    [ Marcar pagado ]         │
│                             │
│ 💡 Luz                       │
│    vence 15 jul    $15.000  │
│    [ Marcar pagado ]         │
│                             │
│ 💳 Tarjeta de crédito         │
│    vence 20 jul    $10.000  │
│    [ Marcar pagado ]         │
├─────────────────────────────┤
│ PAGADOS (2)                  │
│ 📱 Plan móvil        $8.000 ✓│
│ 🎬 Suscripción       $4.000 ✓│
├─────────────────────────────┤
│              [+ Agregar]     │
└─────────────────────────────┘
```

### Componentes y lógica
- **Ordenado por urgencia**: pendientes primero, ordenados por `fechaVencimiento` ascendente (los que vencen antes, arriba).
- **Total pendiente** destacado arriba — este número alimenta directamente el cálculo de "disponible para gastar" del dashboard.
- **"Marcar pagado"** cambia `estado` de PENDIENTE a PAGADO y crea automáticamente el `Transaction` tipo `GASTO` correspondiente, después de confirmar cuenta y categoría. Esto evita el doble ingreso manual: el usuario no paga la luz para luego tener que anotarla otra vez en Movimientos.
- **Edición**: solo los compromisos `PENDIENTE` son editables. Los `PAGADO` no se editan directo porque ya tienen un `Transaction` tipo `GASTO` y un ajuste de saldo asociado.
- **Eliminación**: solo los compromisos `PENDIENTE` son eliminables. Los `PAGADO` deben volver primero a `PENDIENTE` mediante la reversa segura, que restaura saldo y elimina la transacción de pago vinculada.
- **Compromisos recurrentes** (`tipo: RECURRENTE`, ej. suscripción, plan móvil): al consultar un mes, la API genera las instancias mensuales faltantes desde `CommitmentTemplate` activas, con estado `PENDIENTE`, para que el usuario no tenga que recrearlas cada mes. La generación es idempotente por `templateId + anio + mes`, reforzada por índice único y `skipDuplicates`; no crea `Transaction`, no toca saldos y no muta plantillas.
- **Edición de plantilla recurrente**: editar un `CommitmentTemplate` no muta compromisos ya generados. Si el compromiso del mes visible ya existe, la UI informa que el cambio aplicará desde el próximo compromiso generado.
- **Variables** (`tipo: VARIABLE`, ej. luz, agua): el monto se edita manualmente cada mes al cargarlo, ya que cambia.

### Estados
- **Vacío**: "Sin compromisos este mes" + CTA agregar.
- **Todo pagado**: mensaje positivo tipo "Mes al día ✓", refuerza el hábito.

### Gestión de Recurrentes (Plantillas)

Adicional a los compromisos del mes, la pantalla incluye un panel para gestionar las plantillas de compromisos recurrentes (`CommitmentTemplate`).

```
┌─────────────────────────────┐
│  [< Volver] Recurrentes [+]  │
├─────────────────────────────┤
│ 🎬 Suscripción       $4.000    │
│    vence día 10   [ ●━━ ]     │
├─────────────────────────────┤
│ 📱 Plan móvil         $8.000   │
│    vence día 5    [ ●━━ ]     │
├─────────────────────────────┤
│ 🏋️ Actividad física  $12.000   │
│    (sin día fijo) [ ━━● ]     │
└─────────────────────────────┘
```

- **Lista simple**: Muestra nombre, monto por defecto, día de vencimiento (o "sin día fijo") y un *toggle* para activar/desactivar.
- **`[+]`**: Abre el formulario para crear una nueva plantilla.
- **Tap en un item**: Abre el formulario para editar la plantilla existente.
- **Toggle `[ ●━━ ]`**: Activa o desactiva la plantilla. Una plantilla inactiva no generará compromisos `PENDIENTE` en meses futuros.
- **Aviso posterior a edición**: si al guardar una edición ya existe el compromiso del mes visible, se muestra un aviso accesible en español (`role="status"`), se descarta automáticamente después de 5 segundos y se remueve del DOM para recuperar el espaciado.

### Estado implementado al 12 jul 2026

El módulo de `Compromisos` está **completo para V1 operativa**.

- **Generación automática**: `GET /commitments?month=...` genera las instancias `PENDIENTE` faltantes desde plantillas activas.
- **Selector de mes**: navegación anterior/siguiente e input mensual implementados; el mes seleccionado alimenta listado, creación, edición y generación recurrente.
- **CRUD de `Commitment`**: Creación, edición y eliminación de compromisos `PENDIENTE` implementada. Crear/editar aceptan `month` opcional, validan que la fecha de vencimiento caiga dentro del mes seleccionado y conservan `2026-07` como default de compatibilidad.
- **Flujo de pago**: Marcar como `PAGADO` crea el `GASTO` correspondiente y ajusta saldos de forma atómica. Los `PAGADO` están protegidos contra edición/eliminación.
- **Reversa de pago / marcar pendiente**: restaura el saldo, elimina la transacción de pago vinculada y devuelve el compromiso a `PENDIENTE`.
- **Contrato seguro `canRevertPayment`**: los compromisos pagados legacy sin `paymentTransactionId` no se consideran reversibles automáticamente.
- **CRUD de `CommitmentTemplate`**: Creación, edición, y activación/desactivación de plantillas desde la UI de "Recurrentes" está implementado.
- **Aviso por edición sin mutación retroactiva**: `GET /commitments` expone `templateId` en el DTO de lectura para detectar si un compromiso visible pertenece a la plantilla editada; Web muestra el aviso accesible cuando corresponde.
- **Prevención de duplicados recurrentes**: único `(templateId, anio, mes)` en schema/docs schema, migración `20260711120000_commitment_template_month_unique` con deduplicación previa, y generación con `createMany(..., skipDuplicates: true)`.
- **Confiabilidad de refresco**: una guardia por mes seleccionado evita que respuestas o errores de requests antiguos sobrescriban la vista actual.
- **UI pulida**: Se implementaron todos los mensajes de estado, avisos (ej. sobre eliminación), botones alineados y mejoras de layout solicitadas.
- **Validación manual registrada**: el aviso de edición de plantilla recurrente fue validado visualmente por el usuario: aparece, desaparece y el espaciado se recupera.

---

## 6. Seguimiento de metas

### Propósito
Responder la pregunta 2 (¿cómo voy con mis metas de ahorro?).

### Wireframe

```
┌─────────────────────────────┐
│  Metas                [+]   │
├─────────────────────────────┤
│ 🏖️ Meta de viaje             │
│ ▓▓▓▓▓░░░░░  45%               │
│ $90.000 / $200.000           │
│ Cuenta: Ahorro                │
├─────────────────────────────┤
│ 🛟 Reserva emergencia         │
│ ▓▓▓▓▓▓▓░░░  70%               │
│ $140.000 / $200.000          │
│ Cuenta: Emergencia            │
├─────────────────────────────┤
│ PAUSADAS                     │
│ 🚗 Renovación vehículo        │
├─────────────────────────────┤
│ COMPLETADAS                  │
│ 💻 Equipo de trabajo ✓        │
└─────────────────────────────┘
```

Al tocar `[+]` o una meta existente:

```
┌─────────────────────────────┐
│  ✕  Nueva meta       Guardar│
├─────────────────────────────┤
│  Nombre                      │
│  [ Meta de viaje__________]  │
│  Monto objetivo              │
│  [ $ 200.000 ]                │
│  Cuenta dedicada              │
│  [ Ahorro ▾ ]                 │  ← selector de Account activa
│  Notas                       │
│  [_______________________]   │
└─────────────────────────────┘
```

### Notas de comportamiento
- **El progreso se calcula 100% desde `account.saldo`**, tal como está definido en el schema — no hay campo `montoAhorrado` en `Goal`. Esto significa que **el usuario "ahorra" transfiriendo dinero a la cuenta dedicada de la meta**, usando el flujo de Transferencia de la pantalla de Ingreso rápido. Vale la pena que esto quede explícito en la UI (ej. un botón directo "Agregar a esta meta" dentro del detalle de la meta, que abre el formulario de transferencia con la cuenta destino ya preseleccionada) — si no, el usuario tiene que ir a Ingreso rápido, elegir Transferencia, y buscar la cuenta manualmente cada vez.
- **Una cuenta = una meta** en el modelo actual (relación 1 a muchos desde `Account`, pero en la práctica cada meta necesita su propia cuenta dedicada para que el saldo no se mezcle con otra meta). Si el usuario quiere dos metas en la práctica compartiendo la misma cuenta, el progreso de ambas quedaría acoplado — es una limitación a tener presente, no un bug, pero vale la pena que quede anotada.
- **Cuenta válida**: crear/editar metas solo permite cuentas activas de tipo `AHORRO` o `RESERVA`.
- **Sin mutación de dinero**: crear, editar, eliminar o cambiar estado de una meta no modifica saldos ni crea/elimina transacciones. El borrado seguro elimina solo la meta.
- **Notas**: si `notas` se omite al editar, se conserva el valor existente; si se envía vacío/null, se limpia.

### Estado implementado al 11 jul 2026

- `GET /goals`.
- Crear, editar y eliminar metas desde API/UI.
- Validación de cuenta activa `AHORRO` o `RESERVA`.
- Progreso calculado desde `account.saldo / montoObjetivo`.
- UI diferencia `Monto objetivo` del progreso actual y explica que el avance ocurre transfiriendo dinero a la cuenta asociada.
- Ciclo de estado implementado: `ACTIVA` puede pausarse/completarse; `PAUSADA` puede reactivarse; `COMPLETADA` no tiene acciones de ciclo en este corte.
- Botones y alineación de acciones pulidos.
- Acciones de tarjeta alineadas al estándar visual aplicado y progreso visible en la experiencia principal.
- Pendiente: atajo "Agregar a esta meta" si se quiere reducir taps para transferir a la cuenta asociada.

---

## 7. Decisiones cerradas (04 jul 2026)

| # | Decisión | Resolución |
|---|---|---|
| 1 | Presupuesto mensual / barra de progreso | **No existe.** Disponible = solo el número absoluto (`saldo operativo − compromisos pendientes`), sin comparar contra un tope. |
| 2 | Registro de `TRANSFERENCIA` en `tipo` | El campo `tipo` de cada lado de la transferencia es `GASTO` o `INGRESO` según corresponda (nunca literalmente `TRANSFERENCIA`); lo que los vincula es el `transferId` compartido. **El cálculo de Ingresos/Gastos del mes debe excluir todo movimiento con `transferId` no nulo**, o el dashboard va a contar como gasto/ingreso real algo que solo es dinero moviéndose entre cuentas propias. |
| 3 | Auto-generar `Transaction` al marcar compromiso pagado | **Sí.** Al tocar "Marcar pagado" en un `Commitment`, la app crea automáticamente el `Transaction` tipo `GASTO` correspondiente (mismo monto, categoría sugerida según el nombre del compromiso, cuenta a elegir en ese momento si no hay una por defecto). Un solo tap cubre ambos registros. |
| 4 | Recurrentes que varían mes a mes (ej. Play, se contrata o no según el mes) | **Opción B**: se separa "definición recurrente" (plantilla) de "instancia mensual" (el `Commitment` real de cada mes). Requiere agregar una tabla nueva — ver sección 7.1. |
| 5 | Atajo "Agregar a esta meta" | Confirmado. Botón directo en el detalle de cada `Goal` que abre el formulario de Transferencia con la cuenta destino ya fija, evitando que el usuario tenga que buscarla entre todas sus cuentas cada vez — más relevante todavía cuando existen varias subcuentas o bolsillos internos (ver sección 7.2). |

### 7.1 Cambio de schema aplicado — `CommitmentTemplate`

Para soportar recurrentes que se activan/desactivan mes a mes sin duplicar trabajo manual ni ensuciar el histórico:

```prisma
model CommitmentTemplate {
  id                String         @id @default(cuid())
  nombre            String
  tipo              CommitmentType // normalmente RECURRENTE
  montoDefault      Int
  diaVencimiento    Int?           // día del mes, ej. 5
  activa            Boolean        @default(true) // si está en false, no se genera instancia el próximo mes
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  instancias        Commitment[]

  @@map("commitment_templates")
}
```

Y `Commitment` gana una relación opcional a su plantilla de origen:

```prisma
model Commitment {
  // ...campos existentes...
  templateId        String?
  template          CommitmentTemplate? @relation(fields: [templateId], references: [id])

  @@unique([templateId, anio, mes])
}
```

**Lógica de generación implementada**: al abrir `GET /commitments?month=YYYY-MM`, el sistema recorre las `CommitmentTemplate` con `activa = true` y crea solo las instancias faltantes para ese mes, con `estado: PENDIENTE`. Es idempotente por `templateId + anio + mes`, con constraint único y `createMany(..., skipDuplicates: true)`; la migración `20260711120000_commitment_template_month_unique` deduplica antes de crear el índice. Omite plantillas inactivas, no crea `Transaction`, no modifica saldos y no muta plantillas. Si `diaVencimiento` es `null`, la instancia queda sin fecha de vencimiento; si tiene valor, se ajusta al rango válido del mes objetivo. Los compromisos `VARIABLE` (luz, agua) no necesitan plantilla — se siguen cargando a mano cada mes porque el monto cambia. Las plantillas son solo para recurrentes de monto fijo que además pueden pausarse (Play, cualquier suscripción que se active/desactive según el mes).

**UI de Compromisos**: Implementada, incluyendo el panel de "Recurrentes" para el CRUD y activación/desactivación de las plantillas. El toggle `activa` permite controlar la generación de instancias futuras. Editar una plantilla no sincroniza compromisos ya generados; cuando el compromiso del mes visible ya existe, la UI muestra un aviso accesible y temporal para explicar esa regla.

### 7.2 Cuentas como "bolsillos", no cuentas bancarias físicas

Confirmado: `Account` en este modelo representa un bolsillo controlado por la persona usuaria, no necesariamente una cuenta bancaria 1 a 1. Si una entidad financiera permite apartados internos para separar ahorros, cada apartado se modela como una `Account` de tipo `AHORRO` independiente, con un nombre que deje claro que pertenece al mismo origen financiero:

- `Ahorro - Viaje`
- `Ahorro - Emergencia`
- (cualquier otro apartado que se utilice)

Esto no requiere cambios de schema — ya está soportado porque `Account` no tiene ninguna restricción de unicidad más allá del `id`. Solo es una convención de nombres a seguir en la pantalla de Gestión de cuentas, idealmente con un prefijo visual (ej. agrupar por origen financiero en vez de solo por `AccountType`, o mostrar el prefijo del bolsillo en la lista) para que no se confunda con el saldo real externo.

---

## 8. Próximos pasos sugeridos

1. Implementar auth + ownership (`User` + `userId`) antes de deploy público o acceso fuera de entorno local controlado.
2. Preparar checklist de entrega V1 y cerrar deuda UX menor detectada en uso real.
3. Completar PWA solo si bloquea el uso diario: manifest, instalación móvil, iconos y offline básico.
4. Evaluar opcionales post-MVP: atajo "Agregar a esta meta", búsqueda/scroll en movimientos y scripts raíz para levantar web + API juntos.

### Verificación recomendada

```bash
cd apps/api && pnpm typecheck && pnpm test
cd apps/web && pnpm typecheck
```

Para documentación, no hay checker Markdown dedicado configurado; revisar el diff es suficiente.
