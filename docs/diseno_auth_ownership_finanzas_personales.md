# Diseño de autenticación y ownership — Finanzas Personales

Este documento registra la decisión de implementar autenticación con modelo `User` y ownership por `userId` en las entidades financieras. La aplicación sigue siendo cerrada en el primer corte, pero el diseño evita una contraseña global compartida y prepara el camino para más usuarios sin reescribir el modelo de datos.

**Estado actual**: diseño aprobado y documentado; todavía no está implementado. Este es el próximo trabajo arquitectónico antes de deploy público o exposición fuera del entorno local.

## 1. Decisión resumida

| Tema | Decisión |
|---|---|
| Modelo de acceso | Usar `User + ownership`, no una contraseña global de aplicación. |
| Alcance inicial | Producto cerrado: sin registro público ni invitaciones. Se crea o usa un usuario inicial. |
| Sesión | Usar JWT firmado en cookie HTTP-only. |
| Hash de contraseña | Usar `argon2id`. |
| Usuario inicial/backfill | Resolver el usuario destino con `INITIAL_USER_EMAIL`. |
| Aislamiento de datos | Toda entidad financiera pertenece a un `User` mediante `userId`. |
| Regla base de API | Toda lectura y escritura se filtra por el `userId` del usuario autenticado. |

La razón principal es reducir riesgo futuro: si la aplicación después soporta más usuarios, los datos ya quedan aislados por propietario y no mezclados detrás de una clave global.

## 2. No objetivos del primer slice

Este primer slice no implementa:

- Registro público de usuarios.
- Roles o permisos granulares.
- Recuperación o reset de contraseña.
- Administración multi-tenant.
- Invitaciones o UI de administración de usuarios.
- OAuth, salvo que se elija explícitamente en una decisión posterior.

## 3. Modelo de datos propuesto

### `User`

Campos previstos:

| Campo | Nota |
|---|---|
| `id` | Identificador interno. |
| `email` | Identidad de login; debe ser único. |
| `passwordHash` | Hash de contraseña, nunca contraseña en texto plano. |
| `displayName` | Opcional para UI. |
| `createdAt` | Fecha de creación. |
| `updatedAt` | Fecha de última actualización. |

### Entidades con ownership

Agregar `userId` a:

- `Account`
- `Category`
- `Transaction`
- `CommitmentTemplate`
- `Commitment`
- `Goal`

Cada relación debe permitir consultar desde `User` hacia sus entidades y desde cada entidad hacia su propietario.

### Unicidad scoped por usuario

Los índices únicos que hoy representen reglas funcionales globales deben revisarse para incluir `userId` cuando la regla pertenezca al usuario.

Ejemplos esperados:

- Nombre de categoría único por usuario, no global.
- Nombres o claves de cuentas únicos por usuario si aplica.
- Reglas de unicidad de compromisos/plantillas acotadas al propietario cuando corresponda.
- La unicidad mensual de compromisos generados debe seguir evitando duplicados; si depende de `templateId`, validar que `templateId` ya esté aislado por usuario o agregar el scope necesario.

## 4. Diseño de API

### Endpoints de sesión

Endpoints previstos:

| Endpoint | Propósito |
|---|---|
| `POST /auth/login` | Valida credenciales y crea sesión. |
| `POST /auth/logout` | Cierra sesión o invalida cookie/token. |
| `GET /auth/session` | Devuelve el usuario actual si la sesión es válida. |

### Estrategia de sesión/cookie

La API debe usar un JWT firmado en una cookie HTTP-only para sostener la sesión del navegador. Esta es una decisión de diseño confirmada; todavía no describe comportamiento implementado.

Requisitos mínimos:

- Secreto de firma por variable de entorno.
- `httpOnly` para impedir acceso desde JavaScript del cliente.
- `secure` en producción.
- `sameSite` compatible con el despliegue real.
- Configuración explícita de CORS y cookies si Web y API quedan en orígenes distintos.

Variables esperadas, a definir al implementar:

- `AUTH_SECRET` o equivalente para firmar/verificar JWT.
- Configuración de cookie/session TTL.
- Origen permitido para Web en producción.

### Hash de contraseña

Las contraseñas deben almacenarse con `argon2id`. No se debe persistir contraseña en texto plano ni usar una contraseña global de aplicación. La elección de librería concreta queda para implementación, validando compatibilidad con el runtime y el entorno de despliegue.

### Middleware y usuario actual

Agregar middleware de autenticación que:

1. Lee y valida la sesión/cookie.
2. Resuelve `currentUser`.
3. Rechaza requests no autenticados con `401`.
4. Expone `currentUser.id` a los handlers.

Los handlers no deben aceptar `userId` desde el cliente para decidir ownership. El `userId` efectivo sale de la sesión autenticada.

### Scoping obligatorio

Toda operación sobre datos financieros debe filtrar por `userId`:

- Listados y detalle.
- Creación.
- Edición.
- Eliminación.
- Operaciones derivadas como pago/reversa de compromisos, transferencias internas y cálculos del dashboard.

Las relaciones cruzadas también deben validarse dentro del mismo usuario. Por ejemplo, una `Transaction` no debe poder usar una `Account` o `Category` de otro usuario.

### Tests requeridos

La implementación debe cubrir:

- Requests sin sesión devuelven `401`.
- Un usuario no puede leer ni modificar entidades de otro usuario.
- Caminos felices con `currentUser` para cada módulo.
- Validaciones de relaciones cruzadas entre entidades del mismo usuario.
- Login, logout y consulta de sesión.

## 5. Diseño Web

### Login gate

La Web debe mostrar una pantalla de login antes de acceder a la aplicación cuando no haya sesión válida.

Flujo esperado:

1. Al cargar, consultar `GET /auth/session`.
2. Si hay usuario, renderizar la app.
3. Si no hay usuario, renderizar login.
4. Al hacer login exitoso, refrescar estado de sesión y entrar a la app.

### Logout

Agregar acción visible de logout que llame a `POST /auth/logout`, limpie el estado local de sesión y vuelva al login gate.

### Requests autenticados

Las llamadas desde Web a API deben enviar credenciales/cookies, por ejemplo con `credentials: "include"` si Web y API quedan separados por origen.

No se debe guardar contraseña ni secretos de sesión en `localStorage`.

### Manejo de `401`

Ante `401` o expiración de sesión:

- Limpiar estado local de usuario.
- Volver al login gate.
- Mostrar un mensaje claro y no destructivo.
- Evitar loops de retry automáticos.

## 6. Impacto en migración, importación y seed

### Migración de datos existentes

La migración debe crear o resolver un usuario inicial mediante `INITIAL_USER_EMAIL` y asignarle los datos existentes:

- `Account`
- `Category`
- `Transaction`
- `CommitmentTemplate`
- `Commitment`
- `Goal`

La migración local de datos ya importados debe tratarse con cuidado: antes de correrla contra una base real, validar backup y conteos por entidad. No tocar datos reales durante planificación o documentación.

Estado local conocido al momento de documentar este diseño: la importación real ya fue ejecutada correctamente con backup previo. Conteos post-importación: 8 cuentas, 18 categorías, 58 movimientos, 8 plantillas de compromiso, 9 compromisos y 4 metas. Algunos registros pueden usar la fecha técnica `2026-07-01` y campos opcionales de vencimiento/pago en `null`.

### Importador de datos reales

El importador debe requerir o resolver explícitamente el usuario destino. No debe importar datos sin propietario.

Opciones aceptables para el primer corte:

- Variable de entorno `INITIAL_USER_EMAIL` con el email del usuario destino.
- Resolución explícita del usuario inicial si el producto sigue cerrado y solo existe uno, siempre derivada de esa configuración.

### Seed demo

El seed debe crear un usuario demo y asociar toda la data demo a ese usuario. Los tests o entornos demo no deben depender de datos globales sin ownership.

## 7. Plan de implementación por slices

Este plan define el orden de trabajo. No implica que las capacidades ya estén implementadas.

1. **Schema + seed con ownership**: agregar `User`, `userId`, relaciones e índices scoped; crear usuario inicial/demo y preparar backfill controlado.
2. **Auth core API**: implementar login/logout/session, JWT firmado en cookie HTTP-only, `argon2id` y middleware `currentUser`.
3. **Ownership en cuentas + Quick Entry**: aplicar scoping en cuentas, opciones de ingreso rápido y creación de movimientos desde Quick Entry.
4. **Ownership en transacciones/movimientos**: aislar listados, edición, eliminación, transferencias internas y validaciones cruzadas.
5. **Dashboard, metas y compromisos**: aplicar ownership a cálculos agregados, metas, plantillas recurrentes, compromisos, pago y reversa.
6. **Importador y backfill controlado**: exigir `INITIAL_USER_EMAIL`, validar conteos aprobados y asignar datos existentes al usuario inicial sin exponer detalles sensibles.
7. **Login gate Web + logout**: bloquear acceso sin sesión, manejar expiración/`401`, enviar cookies y exponer logout.
8. **Hardening de config/deploy**: documentar variables, cookies, CORS, HTTPS, TTL y checklist de no deploy público hasta verificar auth + ownership.

## 8. Riesgos y decisiones abiertas

| Tema | Estado |
|---|---|
| Estrategia de sesión | Cerrado: JWT firmado en cookie HTTP-only. Falta implementación. |
| Hash de contraseña | Cerrado: `argon2id`. Falta implementación y elección de librería compatible. |
| Usuario inicial/backfill | Cerrado: `INITIAL_USER_EMAIL` es la fuente para resolver el usuario inicial y destino de backfill. |
| Render/Cloudflare cookie/CORS | Abierto. Cloudflare Pages + Render son razonables más adelante; validar dominios, `sameSite`, `secure`, HTTPS y orígenes permitidos. |
| Migración de datos locales ya importados | Parcialmente cerrado. Usuario destino vía `INITIAL_USER_EMAIL`; falta ejecutar backfill con ownership y validar conteos aprobados. |
| TTL y renovación de sesión | Abierto. Definir duración y comportamiento al expirar. |

## 9. Checklist de aceptación

- [ ] Existe modelo `User` con `email`, `passwordHash`, `displayName?`, `createdAt` y `updatedAt`.
- [ ] `Account`, `Category`, `Transaction`, `CommitmentTemplate`, `Commitment` y `Goal` tienen `userId` obligatorio.
- [ ] Las constraints únicas relevantes están scoped por usuario.
- [ ] Login, logout y session endpoints funcionan con JWT firmado en cookie HTTP-only.
- [ ] Las contraseñas se almacenan con `argon2id`.
- [ ] Requests sin sesión reciben `401`.
- [ ] Todos los handlers usan `currentUser.id`, no `userId` enviado por cliente.
- [ ] Lecturas y escrituras quedan aisladas por usuario.
- [ ] Relaciones cruzadas no permiten mezclar entidades de usuarios distintos.
- [ ] Web bloquea acceso sin sesión y permite logout.
- [ ] Web envía cookies/credenciales en requests autenticados.
- [ ] Web maneja expiración de sesión sin romper el flujo.
- [ ] Migración/backfill asigna datos existentes al usuario resuelto por `INITIAL_USER_EMAIL`.
- [ ] Importador real exige o resuelve usuario destino.
- [ ] Seed demo crea datos asociados a un usuario demo.
- [ ] Variables de entorno de auth/cookies/CORS están documentadas para deploy.

## 10. Archivos probablemente afectados al implementar

Esta lista orienta el cambio futuro; este documento no modifica implementación.

| Área | Archivos probables |
|---|---|
| Prisma | `apps/api/prisma/schema.prisma`, migraciones en `apps/api/prisma/migrations/`, seed en `apps/api/prisma/seed.ts` si existe. |
| API auth | `apps/api/src/app.ts`, nuevos módulos bajo `apps/api/src/auth/`, tipos/middleware de request. |
| API módulos financieros | `apps/api/src/accounts/*`, `apps/api/src/transactions/*`, `apps/api/src/movements/*`, `apps/api/src/categories/*`, `apps/api/src/commitments/*`, `apps/api/src/commitment-templates/*`, `apps/api/src/goals/*`, `apps/api/src/dashboard/*`. |
| Web | `apps/web/src/App.tsx`, cliente/fetcher de API, componentes de login/logout y manejo global de sesión. |
| Shared types | `packages/shared-types/src/index.ts` si se exponen tipos nuevos. |
| Importación | Scripts o módulos de importación de datos reales bajo `apps/api` o `docs/importacion` según estructura vigente. |
| Deploy/env | Archivos de ejemplo de entorno y documentación operativa, si existen. |

## 11. Referencias relacionadas

- `estado_actual_finanzas_personales.md`: estado funcional actual y deuda activa.
- `docs/estructura_proyecto_finanzas_personales.md`: estructura del monorepo y módulos existentes.
