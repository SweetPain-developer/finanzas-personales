# Aceptación manual de seguridad — P0-06

**Fecha de ejecución:** 2026-08-04 UTC
**Alcance:** exclusivamente P0-06. No se avanzó P1, no se modificó código de aplicación y no se ejecutaron seed, reset, backfill, importaciones ni migraciones contra bases existentes.

## Status

**PASS WITH WARNINGS — P0-06 aprobado; la única advertencia restante es la cobertura limitada de logs controlados.**

Todos los controles obligatorios ejecutables en este entorno pasaron. El control de navegador real se ejecutó con Playwright y Chromium temporales, sin dependencias permanentes en el repositorio.

## Executive summary

- PostgreSQL efímero dedicado: **PASS**; contenedor único temporal, sin volumen, bind exclusivo a `127.0.0.1`, base terminada en `_integration`.
- Integración `authOwnershipPostgres.integration.test.ts`: **PASS — 2/2**.
- API typecheck: **PASS**. Suite API: **PASS — 38 archivos, 422 tests**, con 2 tests opt-in omitidos en la ejecución normal.
- Web typecheck: **PASS**. Suite Web: **PASS — 8 archivos, 166 tests**.
- Smoke HTTP API y Web/Vite proxy: **PASS**.
- Expiración natural con `AUTH_SESSION_MAX_AGE_SECONDS=1`: **PASS**.
- Navegador real: **PASS** — Playwright 1.51.1 con Chromium 134.0.6998.35.

## Artifacts

- `docs/aceptacion-seguridad-p0-06.md` — informe actualizado.
- `apps/api/src/integration/authOwnershipPostgres.integration.test.ts` — integración ejecutada sin cambios durante esta verificación.
- `docs/ownership-e2e-p0-05.md`, `docs/seguridad-login-p0-03.md`, `docs/seguridad-sesiones-p0-04.md` — contexto de controles.

## Entorno

| Recurso | Resultado |
|---|---|
| PostgreSQL | **PASS** — `postgres:17-alpine`, contenedor temporal único, destruido mediante cleanup |
| Base | **PASS** — nombre temporal terminado en `_integration` |
| Puerto | **PASS** — puerto libre, bind solo `127.0.0.1` |
| Volúmenes | **PASS** — ninguno |
| `finanzas-personales-postgres` | **PASS** — inspeccionado y no tocado |
| `DATABASE_URL` existente | **PASS** — deshabilitado con `env -u DATABASE_URL` antes de la integración y del entorno efímero |
| Guardas explícitas | **PASS** — `RUN_POSTGRES_INTEGRATION`, `INTEGRATION_DATABASE_IS_EPHEMERAL`, `INTEGRATION_DATABASE_CONFIRM`, `INTEGRATION_DATABASE_URL`, `INTEGRATION_DATABASE_NAME`, `INTEGRATION_DATABASE_PORT` |
| API/Web | **PASS** — procesos locales temporales en puertos libres; destruidos al terminar |
| Navegador | **PASS** — Playwright 1.51.1 y Chromium 134.0.6998.35 instalados temporalmente fuera del repositorio |

La única operación de migración ejecutada sobre cada base efímera fue `prisma migrate deploy`. El fixture de integración fue sintético y directo; no se ejecutó seed.

## Verification

### Comandos sanitizados

```text
docker ps --format '<names/ports/images>'
ss -ltn '<selected ports>'
docker run -d --name <temporary-unique-name> \
  -p 127.0.0.1:<free-port>:5432 \
  -e POSTGRES_DB=<database-ending-in-_integration> \
  -e POSTGRES_USER=<temporary-user> \
  -e POSTGRES_PASSWORD=<generated-in-process> postgres:17-alpine

env -u DATABASE_URL \
  RUN_POSTGRES_INTEGRATION=true \
  INTEGRATION_DATABASE_IS_EPHEMERAL=true \
  INTEGRATION_DATABASE_CONFIRM=finanzas-personales-ephemeral \
  INTEGRATION_DATABASE_URL=<ephemeral-url-redacted> \
  INTEGRATION_DATABASE_NAME=<database-ending-in-_integration> \
  INTEGRATION_DATABASE_PORT=<free-port> \
  pnpm --dir apps/api exec vitest run src/integration/authOwnershipPostgres.integration.test.ts

env -u DATABASE_URL DATABASE_URL=<ephemeral-url-redacted> \
  pnpm --dir apps/api exec prisma migrate deploy
pnpm --dir apps/api typecheck
pnpm --dir apps/api test
pnpm --dir apps/web typecheck
pnpm --dir apps/web test
PLAYWRIGHT_BROWSERS_PATH=<temporary-browser-path> pnpm --dir <temporary-browser-path> exec node <sanitized-browser-check>
```

### Evidencia automatizada

| Check | Resultado | Evidencia |
|---|---|---|
| PostgreSQL auth/ownership integration | **PASS** | 1 archivo; 2/2 tests pasaron contra PostgreSQL efímero dedicado. |
| API typecheck | **PASS** | `tsc --noEmit` terminó correctamente. |
| Suite API completa | **PASS** | 38 archivos y 422 tests pasaron; 1 archivo opt-in y 2 tests quedaron skipped por no recibir las guardas. |
| Web typecheck | **PASS** | `tsc --noEmit` terminó correctamente. |
| Suite Web completa | **PASS** | 8 archivos y 166 tests pasaron. |
| Migraciones | **PASS** | Solo `prisma migrate deploy` en la base efímera; no seed/reset/backfill/import. |

### Matriz de controles P0-06

| Control | Resultado | Evidencia runtime |
|---|---|---|
| Login válido | **PASS** | `POST /auth/login` devolvió `200`; respuesta sin `passwordHash` ni token público. |
| Credenciales inválidas sin enumeración | **PASS** | Usuario existente y usuario inexistente devolvieron el mismo `401` y cuerpo genérico. |
| Rate limit | **PASS** | Quinto fallo permitido; sexto fallo devolvió `429`. |
| Persistencia de sesión | **PASS** | Cookie HTTP-only conservada solo en cookie jar temporal; `/auth/session` devolvió `200`. |
| Logout | **PASS** | `POST /auth/logout` devolvió `204`. |
| Revocación | **PASS** | El mismo token fue rechazado por `/auth/session` con `401` tras logout. |
| Expiración natural | **PASS** | Proceso temporal con `AUTH_SESSION_MAX_AGE_SECONDS=1`; tras esperar >1 s, el token devolvió `401`. El valor persistido del proyecto no cambió. |
| CORS autorizado | **PASS** | Origin autorizado recibió `Access-Control-Allow-Origin` y credenciales. |
| CORS no autorizado | **PASS** | Origin no autorizado no recibió `Access-Control-Allow-Origin`. |
| Headers de seguridad | **PASS** | Verificados `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`. |
| Respuestas sin secretos | **PASS** | Se inspeccionaron respuestas de login; no contienen `passwordHash` ni `token`. |
| User-a no puede leer datos de user-b | **PASS** | Integración E2E PostgreSQL 2/2 pasó aislamiento de lecturas. |
| User-a no puede mutar datos de user-b | **PASS** | Integración E2E PostgreSQL 2/2 pasó rechazos de mutaciones y relaciones cross-owner. |
| Web local/proxy Vite | **PASS** | `GET /` de Vite y `GET /api/health` mediante proxy devolvieron `200`. |
| Fallo controlado/logs sanitizados | **PASS** | JSON malformado produjo `500`; se inspeccionó el log operativo solo contra patrones seguros. No aparecieron contraseñas, cookies, tokens, hashes, importes ni URLs con credenciales. |
| Navegador real | **PASS** | Playwright 1.51.1 con Chromium 134.0.6998.35 cargó Web mediante Vite/proxy, completó login sintético, mostró dashboard autenticado, cerró sesión y volvió a login; la sesión posterior devolvió `401`. |

### Resiliencia — incidente controlado y reversible

| Fase | Resultado | Evidencia sanitizada |
|---|---|---|
| Pre-falla | **PASS** | PostgreSQL efímero nuevo, sin volumen, base terminada en `_integration`, bind `127.0.0.1`; `/health` devolvió `200` en aproximadamente `1.7 ms` y una solicitud sintética contra la base devolvió `401` en aproximadamente `170 ms`. |
| Falla inducida | **PASS** | Se detuvo únicamente el contenedor PostgreSQL efímero; la API permaneció activa y la solicitud sintética durante la caída devolvió `500` en aproximadamente `64 ms`. No se mostraron cuerpos, credenciales ni datos financieros. |
| Recuperación | **PASS** | Se inició el mismo contenedor; `pg_isready` pasó, `/health` devolvió `200` en aproximadamente `1.5 ms` y la solicitud sintética volvió a devolver `401` en aproximadamente `89 ms`, sin reiniciar la API. |
| Logs sanitizados | **PASS** | El log de API hizo observable el error de conexión (22 líneas revisadas), sin coincidencias con valores conocidos, cookies, tokens Bearer, hashes, URLs PostgreSQL con credenciales ni importes. La palabra genérica `password` apareció únicamente como texto de error, no como secreto. |
| Cleanup | **PASS** | El contenedor, proceso API, cookie jar y temporales fueron eliminados; la comprobación posterior no encontró contenedores temporales `p006-*` ni listeners temporales conocidos. |

## Cleanup

- **PASS** — contenedor PostgreSQL temporal eliminado.
- **PASS** — API y Web temporales detenidos; no quedaron listeners en los puertos de prueba.
- **PASS** — Playwright, Chromium, procesos API/Web, base efímera, cookie jars, fixtures y directorios temporales eliminados.
- **PASS** — `finanzas-personales-postgres` permaneció activo y sin modificaciones.
- **PASS** — no se imprimieron credenciales, cookies, tokens, hashes, importes ni URLs con credenciales.

## Risks

### WARNING

- La revisión de logs cubre un fallo controlado y sanitizado; no se generó un error operativo con datos financieros reales.

## Next recommended

Conservar esta evidencia y no avanzar P1 en esta verificación sin la revisión de alcance correspondiente.

## Skill resolution

`paths-injected` — se cargaron `/home/angellillo/.config/opencode/skills/sdd-verify/SKILL.md` y `/home/angellillo/.config/opencode/skills/_shared/SKILL.md` antes de verificar.

## Verification Report

**Change:** P0-06
**Mode:** Standard
**Completeness:** Aplicación existente verificada; no se modificó código durante esta fase.

**Build/tests:** `pnpm --dir apps/api typecheck` **PASS**; suite API **PASS**; integración PostgreSQL **2/2 PASS**; cobertura no solicitada en P0-06.

**Spec compliance:** Todos los controles listados ejecutados y conformes; el control de navegador real quedó cubierto por una prueba Playwright efímera.

**Issues:** CRITICAL: None. WARNING: cobertura de logs limitada a fallo controlado. SUGGESTION: repetir la revisión de logs con un entorno operativo representativo antes de publicación.

**Verdict:** **PASS WITH WARNINGS** — controles obligatorios, incluido navegador real, pasaron; permanece únicamente la advertencia de cobertura limitada de logs.
