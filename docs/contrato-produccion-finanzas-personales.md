# Contrato de producción — P1-01

Contrato técnico para una beta privada, reversible y de pocos usuarios. Registra la decisión de proveedor para P1-01; **no implementa deploy, infraestructura ni código**.

## Resumen ejecutivo

Decisión adoptada: Cloudflare Pages para la SPA Web/Vite, Cloudflare DNS/proxy y TLS para los dominios, Render Web Service para la API Node/Express y Render PostgreSQL gestionado. La API permanece en Render; en esta etapa no se migra Express/Prisma a Workers. La topología recomendada usa dominios separados (`app.<dominio>` para Web y `api.<dominio>` para API), con placeholders hasta decidir el dominio real.

## Decisiones y pendientes

| Estado | Decisión |
|---|---|
| Cerrada | Beta privada, sin apertura pública; acceso inicial controlado y datos separados por `userId`. |
| Cerrada | PostgreSQL gestionado, backups automáticos y restauración aislada; no usar la base local de `docker-compose.yml`. |
| Cerrada | HTTPS obligatorio; API expone `GET /health` sin autenticación y sin datos sensibles. |
| Cerrada | Cloudflare Pages sirve la SPA Web/Vite; Cloudflare gestiona DNS/proxy y TLS de los dominios. |
| Cerrada | Render Web Service ejecuta la API Express y Render PostgreSQL proporciona la base gestionada. Express/Prisma permanecen fuera de Workers en esta etapa. |
| Cerrada | Topología recomendada: `app.<dominio>` para Web y `api.<dominio>` para API; usar placeholders mientras no exista dominio exacto. |
| Cerrada | La beta mantiene una sola instancia de API porque el rate limiter actual reside en memoria local. |
| Pendiente/bloqueante | Dominio exacto, región, plan Render, cuenta Cloudflare, estrategia DNS/proxy, repositorio/conexión CI y política de costos. |
| Pendiente | Confirmar RPO/RTO y verificar en el plan Render contratado backups/PITR, restore y región antes de contratar. |
| Pendiente | Cerrar el build/start productivo de la API Express. |

**Alcance explícito:** esta decisión no autoriza todavía crear recursos, configurar DNS, conectar repositorios, contratar planes, ejecutar migraciones ni hacer deploy.

## Entornos y red

| Entorno | Datos | Exposición | Configuración |
|---|---|---|---|
| Local/efímero | PostgreSQL Docker o base `_test`/`_integration` dedicada | `127.0.0.1`; Vite proxy a `localhost:3001` | `.env` local; nunca secretos de staging/producción |
| Staging | PostgreSQL separado, nunca productivo | HTTPS; acceso restringido | variables y secretos propios; dominio temporal |
| Producción | PostgreSQL separado y persistente | HTTPS; beta por invitación/alta controlada | secretos gestionados, sin seed/reset |

Dominios pendientes: `WEB_ORIGIN` y `API_ORIGIN` reales. Para la topología separada, producción debe usar CORS explícito: `AUTH_ALLOWED_ORIGINS=https://app.<dominio>` y credenciales; la Web debe enviar `credentials: include` y nunca se debe usar `*`. Propuesta de cookies de producción para subdominios HTTPS: `AUTH_COOKIE_SECURE=true` y `AUTH_COOKIE_SAME_SITE=lax`; mantener `AUTH_COOKIE_DOMAIN` vacío salvo necesidad demostrada. `none` solo corresponde a un flujo cross-site real sobre HTTPS. `AUTH_SESSION_MAX_AGE_SECONDS` debe ser positivo y no superar el límite configurado por la API; propuesta beta: usar el máximo permitido, sujeta a aprobación. Rate limit actual: 5 fallos/IP en 60 s y bloqueo 300 s; es memoria local y no permite escalar varias instancias sin almacenamiento compartido. Mantener una sola instancia durante la beta hasta resolverlo o externalizar el estado.

## Secretos y almacenamiento

`DATABASE_URL`, `AUTH_JWT_SECRET` (≥32 caracteres), credenciales, claves de proveedor y `INITIAL_USER_EMAIL` se inyectan desde el gestor de secretos; nunca en Git, imágenes ni logs. Rotar ante incidente y periódicamente; rotar JWT exige considerar invalidación de sesiones. Backups cifrados, con retención y ubicación separada del runtime. Los entornos no comparten base, secretos ni buckets.

## Build, arranque y migración

Comandos reales verificados: `pnpm install --frozen-lockfile`; `pnpm --dir apps/api typecheck`; `pnpm --dir apps/api test`; `pnpm --dir apps/api build`; `pnpm --dir apps/api start`; `pnpm --dir apps/web typecheck`; `pnpm --dir apps/web test`; `pnpm --dir apps/web build`. El build de API genera `apps/api/dist/server.cjs`, empaqueta los imports ESM y deja `argon2` y `@prisma/client` como dependencias runtime; no requiere TypeScript ni `tsx` para arrancar. Cloudflare Pages publicará `apps/web/dist` cuando se configure el deploy. El comando exacto de Render queda pendiente de la configuración del proveedor; no se declara aquí.

Orden: backup verificado y restore aislado → detener escritores → comprobar identidad/estado de migraciones → ejecutar backfill solo si aplica y con conteos auditados → verificar ownership → confirmar que la cola pendiente contenga únicamente las migraciones aprobadas → `prisma migrate deploy` → arrancar API → health check → publicar Web. Nunca `migrate reset`, seed, importación ni backfill como rollback. Si falla una migración, detener despliegue y restaurar a una base de reemplazo controlada; rollback de aplicación solo es válido con esquema compatible.

## Operación y aceptación P1-01

Logs centralizados sin cookies, JWT, contraseñas, hashes, URLs de conexión, importes ni payloads financieros; conservar timestamp, versión, request-id, ruta, estado y latencia. Alertar por `/health` caído, 5xx, latencia elevada y 429 de login.

- [x] Proveedor y topología base decididos: Cloudflare Pages/DNS/proxy/TLS + Render Web Service/PostgreSQL; API Express permanece en Render.
- [ ] Dominio exacto, región, plan Render, cuenta Cloudflare y estrategia DNS/proxy aprobados.
- [ ] Matriz de entornos creada con bases y secretos separados.
- [ ] CORS/cookies probados desde dominios reales y origen no autorizado rechazado.
- [x] Build/start de API y Web reproducibles, incluyendo `PORT`, `HOST` y `DATABASE_URL`; API usa `dist/server.cjs` y Web genera `apps/web/dist`.
- [ ] Migración, health check y rollback ensayados en staging.
- [ ] Plan Render verificado para backups/PITR, restore y región; backup cifrado y restore aislado evidenciados; no se declara producción antes de ello.
- [ ] Logs, alertas, rate limiting y política de acceso beta verificables.

**Preguntas bloqueantes:** ¿cuál es el dominio exacto?, ¿qué región y plan Render se autorizan?, ¿qué cuenta Cloudflare se usará y cuál será la estrategia DNS/proxy?, ¿quién administra secretos/backups y su retención?, ¿qué RPO/RTO se aprueban?, ¿se acepta una sola instancia durante la beta mientras el rate limit sea local?, ¿cuál es el procedimiento aprobado de alta/baja y cuál será el build/start productivo de la API?
