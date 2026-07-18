# Estructura de Proyecto — Finanzas Personales

**Fecha**: 04 de julio de 2026
**Estado**: Decisión cerrada — creada e implementada. MVP funcional avanzado; auth + ownership están implementados y el enforcement de base de datos queda como próximo corte antes de deploy público.
**Contexto**: definido en `/docs`, junto a `documento_base_finanzas_personales.md`, `diseno_ui_finanzas_personales.md` y `schema.prisma`

---

## 1. Decisión

**Monorepo simplificado**, sin Turborepo: workspaces de npm/pnpm con dos apps y un paquete de tipos compartidos.

### Por qué no las otras dos opciones evaluadas

| Opción | Por qué no |
|---|---|
| App única (Express sirve API + PWA) | Mezcla dos responsabilidades en un mismo proceso/`package.json`. Funciona hoy, pero si más adelante conviene separar el deploy del frontend (ej. servir la PWA desde un CDN), hay que desenredarlo después. |
| Monorepo completo con Turborepo (mismo patrón que `juego-cartas`) | Turborepo resuelve un problema — orquestar builds cacheados entre múltiples paquetes con lógica compartida cliente/servidor — que este proyecto no tiene. Acá el frontend y el backend se hablan por REST simple, sin lógica de dominio corriendo en ambos lados (a diferencia de Carioca, donde la state machine del juego sí corre en cliente y servidor). Pagar ese costo de configuración no acelera nada acá. |

### Por qué esta sí

Separación limpia de `apps/web` y `apps/api` sin pagar el costo de orquestación de builds que no se necesita. El único código realmente compartido son los tipos de TypeScript (los modelos definidos en `schema.prisma`), y `prisma generate` ya los produce — no hace falta un paquete con build propio, solo un punto de re-exportación.

---

## 2. Estructura de carpetas

```
finanzas-personales/
├── apps/
│   ├── web/                # React + TypeScript (PWA)
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts   (o el bundler que se use)
│   │
│   └── api/                # Node.js + Express + Prisma
│       ├── src/
│       ├── prisma.config.ts # configuración Prisma fuera de package.json
│       ├── prisma/
│       │   └── schema.prisma
│       └── package.json
│
├── packages/
│   └── shared-types/        # Tipos derivados de Prisma, consumidos por web y api
│       ├── src/
│       │   └── index.ts     # re-exporta los tipos generados por Prisma Client
│       └── package.json
│
├── package.json              # raíz: define los workspaces
└── pnpm-workspace.yaml        # (o "workspaces" en package.json si se usa npm)
```

### Configuración de workspaces (raíz)

Con pnpm:

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

Con npm (alternativa, sin herramienta adicional):

```json
// package.json (raíz)
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
```

### `packages/shared-types`

No requiere build propio ni configuración de compilación separada. Su único rol es re-exportar los tipos que Prisma ya genera, para que `apps/web` no tenga que definir a mano interfaces que dupliquen `Account`, `Transaction`, `Commitment`, `Goal`, `Category`, `CommitmentTemplate`:

```ts
// packages/shared-types/src/index.ts
export type {
  Account,
  Transaction,
  Commitment,
  CommitmentTemplate,
  Goal,
  Category,
  AccountType,
  TransactionType,
  CommitmentType,
  CommitmentStatus,
  GoalStatus,
  CategoryType,
} from "@prisma/client";
```

---

## 3. Reglas de esta estructura

- **Sin pipeline de build entre paquetes.** Cada `app` (`web`, `api`) se builda y se corre de forma independiente con sus propios scripts (`npm run dev`, `npm run build`) dentro de su carpeta. No hay orden de build ni cache que gestionar.
- **`shared-types` se consume, no se builda.** Al ser solo re-exportaciones de tipos, no genera artefactos de compilación propios — TypeScript lo resuelve directamente vía referencias de proyecto o path mapping.
- **Reutilizar configs, no estructura, de `juego-cartas`.** Vale copiar los archivos de configuración de Vitest y ESLint desde ese proyecto como punto de partida (ahorra tiempo de setup), pero no la estructura de Turborepo ni la separación en múltiples paquetes de lógica de dominio — esa separación responde a un problema (sync multiplayer) que no existe acá.
- **Turborepo queda disponible como upgrade futuro, no como decisión de hoy.** Si el proyecto creciera lo suficiente como para justificar cache de builds entre paquetes, agregarlo encima de esta estructura (`apps/` + `packages/` ya separados) es un cambio incremental, no una reescritura.
- **CSS real sin Tailwind por ahora.** El frontend usa CSS propio en `apps/web/src/styles.css`; no hay Tailwind, UI kit, router ni state manager. La navegación actual usa estado local simple en `App`.

### Scripts y dev UX pendientes

Hoy cada app se levanta por separado (`apps/api` y `apps/web`). El script `dev` de `apps/api` usa `tsx watch src/server.ts`, así que los cambios de servidor ya no deberían requerir reinicios manuales por procesos stale. Queda pendiente agregar scripts raíz para levantar todo junto.

**Nota operativa**: watch mode no aplica migraciones. Si cambia `schema.prisma`, ejecutar la migración Prisma correspondiente antes de diagnosticar errores de API o datos.

Prisma usa configuración explícita en `apps/api/prisma.config.ts`. El bloque deprecated `package.json#prisma` fue eliminado para preparar el proyecto frente a Prisma 7.

### Estado real de implementación

La estructura ya aloja el flujo incremental actual.

- `Dashboard`: corregido, con cálculos desde API/Prisma y exclusión de transferencias internas.
- `Cuentas`: CRUD completo, incluyendo creación, edición, activación/desactivación y ajuste operativo de saldo.
- `Movimientos`: CRUD completo, con comportamiento consciente de pares de transferencia para mantener consistencia de saldos y representación visual.
- `Metas`: creación, edición, eliminación segura, ciclo de estado y UX de progreso implementados. Las metas validan cuenta activa `AHORRO` o `RESERVA`; el progreso se deriva de `account.saldo / montoObjetivo` y las operaciones de meta no mutan saldos ni transacciones.
- `Compromisos`: CRUD de `Commitment`, CRUD de `CommitmentTemplate`, selector/navegación de mes, flujo de pago y reversa segura implementados. La generación recurrente previene duplicados con único `(templateId, anio, mes)`, migración `20260711120000_commitment_template_month_unique` y `createMany(..., skipDuplicates: true)`. Editar una plantilla no muta compromisos ya generados; Web avisa si el compromiso del mes visible conserva valores anteriores.
- Validación registrada: el aviso al editar una plantilla recurrente ya generada fue validado visualmente por el usuario.
- Importación real: flujo local controlado implementado, testeado y ejecutado correctamente después de backup y confirmación explícita. Conteos post-importación: 8 cuentas, 18 categorías, 58 movimientos, 8 plantillas de compromiso, 9 compromisos y 4 metas.
- Seguridad repo: `origin/main` publicado con commit `7ae4f07` (`chore: initial project setup`). Permanecen ignorados `.env`, workbooks de importación, backups, `.atl`, `.opencode`, `node_modules` y `dist`; artefactos públicos sanitizados con datos demo/genéricos.
- Deploy: Cloudflare Pages + Render son opciones razonables más adelante, pero no se recomienda exponer la app hasta aplicar y verificar el enforcement de base de datos.
- Auth: login/logout/session, middleware de autenticación, ownership por `userId`, login gate Web, logout y manejo de expiración/`401` están implementados. La migración de enforcement queda preparada, pendiente de aplicación.

---

## 4. Próximo paso

El próximo paso técnico documentado es revisar y aplicar, en una ventana controlada, la migración de enforcement `20260717100000_auth_ownership_enforcement` después del backfill y sus verificaciones. Auth + ownership con `User` y `userId` ya están implementados; el diseño está en `docs/diseno_auth_ownership_finanzas_personales.md`.

### Checks útiles

```bash
cd apps/api && pnpm typecheck && pnpm test
cd apps/web && pnpm typecheck && pnpm test
```

Para documentación no existe un checker dedicado registrado en los scripts del monorepo; revisar el diff Markdown es suficiente para cambios solo de docs.
