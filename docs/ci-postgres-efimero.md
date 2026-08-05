# CI reproducible con PostgreSQL efímero

El workflow `.github/workflows/ci.yml` ejecuta la calidad de API/Web y la
integración de ownership contra `postgres:16`, sin volumen persistente. La
base `finanzas_personales_ci_integration` y las credenciales `ci` son valores
sintéticos de CI; no son secretos de ningún entorno.

Para reproducir solo la integración localmente, se necesita Docker y un puerto
local libre (`55432` en este ejemplo):

```bash
container="finanzas-personales-ci-postgres-$$"
docker run --rm --name "$container" \
  -e POSTGRES_USER=ci -e POSTGRES_PASSWORD=ci \
  -e POSTGRES_DB=finanzas_personales_ci_integration \
  -p 127.0.0.1:55432:5432 -d postgres:16
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
until docker exec "$container" pg_isready -U ci -d finanzas_personales_ci_integration >/dev/null; do sleep 1; done

env -u DATABASE_URL \
  RUN_POSTGRES_INTEGRATION=true \
  INTEGRATION_DATABASE_IS_EPHEMERAL=true \
  INTEGRATION_DATABASE_CONFIRM=finanzas-personales-ephemeral \
  INTEGRATION_DATABASE_URL=postgresql://ci:ci@127.0.0.1:55432/finanzas_personales_ci_integration \
  INTEGRATION_DATABASE_NAME=finanzas_personales_ci_integration \
  INTEGRATION_DATABASE_PORT=55432 \
  pnpm --dir apps/api exec vitest run src/integration/authOwnershipPostgres.integration.test.ts
```

La prueba crea y aplica sus migraciones temporales. No ejecutar seed, reset,
backfill o importación, y no apuntar el comando a una base existente.
