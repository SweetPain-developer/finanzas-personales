# Plan de aplicación en producción — Finanzas Personales

Plan para convertir el MVP en una beta privada, reversible y pequeña. **No autoriza código, deploy, migraciones, seed ni cambios de infraestructura.** Arquitectura: Cloudflare Pages/DNS/proxy/TLS + Render Web Service + Render PostgreSQL separado.

## Ruta ejecutiva y dependencias

Ejecutar las fases en orden. Cada puerta debe producir evidencia antes de avanzar; un fallo bloqueante devuelve el trabajo a la fase afectada.

| Fase | Objetivo y tareas técnicas | Depende de | Evidencia/verificación | Terminado cuando | Riesgos |
|---|---|---|---|---|---|
| **1. Build/start** | Cerrar build y arranque de API con `PORT`, `HOST`, `NODE_ENV`, `DATABASE_URL` y `GET /health`. Confirmar Web en `apps/web/dist`. | Contrato P1-01. | `pnpm install --frozen-lockfile`; `pnpm --dir apps/api typecheck`; `pnpm --dir apps/api test`; `pnpm --dir apps/api build`; `pnpm --dir apps/web typecheck`; `pnpm --dir apps/web test`; `pnpm --dir apps/web build`; smoke de `/health`. | API arranca con `pnpm --dir apps/api start` desde `dist/server.cjs`, sin `tsx watch`; Web genera `dist` y los comandos funcionan en entorno limpio. | Arranque incorrecto, variables ausentes o secretos expuestos.
| **2. CI reproducible** | Pipeline con `pnpm@10.0.0`, typecheck, tests, builds y PostgreSQL efímero sin fallback a `DATABASE_URL`; la integración ejecuta sus propias migraciones temporales. Rama/condición de promoción **pendiente**. | Fase 1. | `.github/workflows/ci.yml`; `pnpm install --frozen-lockfile`; comandos de API/Web; integración: `pnpm --dir apps/api exec vitest run src/integration/authOwnershipPostgres.integration.test.ts`. | CI bloquea errores y una ejecución verde queda como evidencia técnica previa a promoción. | Falsa señal verde o guardas no reproducidas.
| **3. Staging Render** | Separar API y PostgreSQL de staging, con secretos propios y Web de prueba. Aplicar migraciones controladas; probar health, CORS/cookies y rollback. No usar seed/reset. | Fases 1–2; región/plan. | URL, versión, logs sanitizados, login/sesión/logout y rollback. Comandos del proveedor **pendientes**. | Flujo completo reproducido sin tocar producción. | Configuración divergente o rollback incompatible.
| **4. Backups y recuperación** | Confirmar frecuencia, retención, cifrado, región/PITR y restore del plan Render. Aprobar RPO/RTO. Restaurar en base aislada, validar schema, usuarios, ownership y registros, y medir tiempo. | Staging, plan y RPO/RTO aprobados. | Evidencia fechada; `prisma migrate deploy` solo en entorno aislado si corresponde. CLI/procedimiento **pendientes**. | Restore cumple RPO/RTO y tiene responsable/runbook. | Backup no restaurable o restore sobre producción.
| **5. Observabilidad** | Monitorizar Web/API y `/health`; centralizar status, latencia, request-id, versión y errores. Excluir cookies, JWT, contraseñas, hashes, credenciales, importes y payloads. Alertar caída, 5xx, latencia y 429. | Staging; contrato de logs. | Error controlado sanitizado (P0-06 aporta evidencia limitada) y alertas recibidas. Proveedor, umbrales, retención y canal **pendientes**. | Se identifica componente y severidad sin exponer datos. | Ruido o alertas no atendidas.
| **6. Cloudflare y seguridad real** | Configurar Pages para `apps/web/dist`, DNS/proxy/TLS y `app.<dominio>`/`api.<dominio>`. Sustituir placeholders por `WEB_ORIGIN`/`API_ORIGIN`; probar CORS explícito, `credentials: include`, `Secure`, `SameSite=lax` y cookie sin dominio salvo necesidad. | Fases 1–3; dominio, cuenta y proxy. | Login, sesión, logout, origen no autorizado, HTTPS y headers desde dominios reales. Configuración Pages/DNS/TLS/CORS **pendiente**. | HTTPS funciona y solo el origen autorizado usa sesión. | DNS/TLS, cookies o CORS mal configurados.
| **7. Deploy limitado y rollback** | Promover una versión inmutable desde CI a staging y luego producción; backup verificado antes de migrar; detener escritores si aplica; `prisma migrate deploy`; arrancar API, health check y después Web. Habilitar 1–5 usuarios por invitación/alta controlada. Documentar rollback de aplicación y recuperación de base; nunca `migrate reset`, seed, backfill o importación como rollback. | Fases 1–6; P1-06 resuelto; backup/restauración aprobados. | Registro de versión, checklist, smoke, prueba de acceso/retirada y simulacro de rollback en staging. Comandos exactos de promoción, migración y rollback **pendientes**. | Beta limitada observable, reversible y con acceso revocable. | Migración no compatible, exposición accidental, rate limiter local incompatible con varias instancias; mantener una sola instancia.
| **8. Aprobación y post-beta** | Revisar checklist P0/P1, incidentes, métricas, errores, feedback y recuperación. Mantener canal de soporte y revisión semanal. Convertir hallazgos en backlog separado; no añadir nuevas features en este ciclo. | Fase 7 y aceptación de seguridad P0-06. | Acta de aprobación, dashboard/logs, evidencia de restore, aceptación manual y lista de incidencias. | Se aprueba continuar, pausar o retirar la beta con decisión explícita. | Normalizar fallos, ampliar alcance sin datos suficientes o prometer disponibilidad no contratada.

## Matriz de decisiones pendientes

| Decisión | Opciones a resolver | Bloquea |
|---|---|---|
| Dominio | Dominio exacto y `app`/`api` | Fases 3, 6, 7 |
| Región | Región común o compatible para Web/API/DB | Fases 3–4 |
| Plan Render | Servicio API + PostgreSQL, backups/PITR/restore y coste | Fases 3–4 |
| Cuenta Cloudflare | Cuenta propietaria, Pages, DNS/proxy/TLS y permisos | Fase 6 |
| RPO/RTO | Valores aprobados para beta y responsable | Fase 4 |
| Build/start API | Cerrados: `pnpm --dir apps/api build` genera `apps/api/dist/server.cjs`; `pnpm --dir apps/api start` ejecuta Node sobre ese artefacto. El comando exacto de Render queda pendiente del proveedor. | Fases 1–3 |

## Secuencia por work units

1. **WU-1:** cerrar API/Web build-start y documentación de variables.
2. **WU-2:** CI reproducible + PostgreSQL efímero.
3. **WU-3:** staging Render y primer rollback.
4. **WU-4:** backup, restore y RPO/RTO.
5. **WU-5:** observabilidad y logs sanitizados.
6. **WU-6:** Cloudflare, dominios, CORS y cookies reales.
7. **WU-7:** deploy limitado, invitaciones y rollback.
8. **WU-8:** aprobación post-beta.

## Evidencia WU-2 — CI reproducible

Implementado el workflow `.github/workflows/ci.yml` para pull requests y push a
`main` (convención actual del repositorio). Usa `ubuntu-24.04`, Node `22.x`,
`pnpm@10.0.0`, `pnpm install --frozen-lockfile`, pasos separados para API/Web
typecheck, tests y builds, y un servicio `postgres:16` sin volumen persistente.

La integración recibe simultáneamente las seis guardas requeridas y una base
`finanzas_personales_ci_integration`; `DATABASE_URL` queda vacío tanto a nivel
de job como de paso de integración, por lo que no existe fallback a una base
heredada. No hay seed, reset, backfill, importación ni deploy automático.

La reproducción local está documentada en `docs/ci-postgres-efimero.md` y usa
un contenedor temporal enlazado a `127.0.0.1`, con eliminación automática.

### Pendientes reales de WU-2

- Confirmar en GitHub la protección de `main` y el check obligatorio del job.
- Definir la condición exacta que permitirá promover una ejecución verde a
  staging; CI todavía no promueve ni despliega.
- Confirmar que `ubuntu-24.04` es el runner aprobado/disponible para el
  repositorio; cambiarlo solo mediante una decisión operativa explícita.

## No-alcance

No se incluyen nuevas funcionalidades, rediseño, apertura pública, multi-tenant avanzado, escalado multi-instancia, migración a Workers, PWA, analítica, recuperación de contraseña ni disponibilidad 24/7. Tampoco se ejecutarán migraciones, seed, backfill, deploy o cambios de infraestructura como parte de este documento.

## Puerta final de publicación

Publicar solo con: CI verde; build/start reproducibles; staging y rollback probados; backup y restore con RPO/RTO cumplidos; observabilidad y alertas activas; dominios HTTPS reales; CORS/cookies validados; P0-06 sin fallos críticos; alta/baja por invitación; una sola instancia mientras el rate limiter sea local; responsable y canal de incidentes aprobados. Si falta una decisión bloqueante o evidencia, **no publicar**.
