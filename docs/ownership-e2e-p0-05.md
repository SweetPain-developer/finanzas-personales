# Evidencia E2E de ownership — P0-05

La prueba `apps/api/src/integration/authOwnershipPostgres.integration.test.ts` ejecuta requests HTTP reales contra la app y un PostgreSQL dedicado. Crea datos sintéticos para `user-a` y `user-b`, autentica cada request con su sesión y verifica que el servidor use el `userId` autenticado, no solo el identificador recibido.

## Matriz de cobertura

| Área | Lectura aislada | Mutación/eliminación cruzada | Relaciones cruzadas | Estado |
|---|---:|---:|---:|---|
| Accounts | Sí | PATCH/DELETE | — | Cubierto |
| Categories | Indirecta por transacciones | — | — | Cubierto mediante operaciones HTTP |
| Transactions | Movements | POST gasto/transferencia | Account + category de otro usuario | Cubierto |
| Movements/transfers | Sí | PATCH/DELETE | Cuentas de otro usuario en transferencias | Cubierto |
| Goals | Sí | PATCH/DELETE/POST | Account de otro usuario | Cubierto |
| Commitment templates | Sí | PATCH/DELETE | — | Cubierto |
| Commitments | Sí | PATCH/DELETE | — | Cubierto |
| Commitment pay/unpay | Sí | Pay/unpay cruzado y flujo propio | Account/category de otro usuario | Cubierto |
| Loans | Sí y detalle | PATCH/DELETE/POST | Account de otro usuario | Cubierto |
| Repayments | Indirecta en loan | POST cruzado | Loan/account de otro usuario | Cubierto |

Los recursos ajenos responden con `404` en operaciones de detalle y mutación, evitando confirmar su existencia. Las validaciones de referencias cruzadas responden con `400` sin alterar datos. El flujo de pago y reversa confirma además que un intento inválido no cambia el estado del compromiso.

## Ejecución segura

La suite está omitida por defecto. Solo se habilita cuando están presentes simultáneamente `RUN_POSTGRES_INTEGRATION=true`, `INTEGRATION_DATABASE_IS_EPHEMERAL=true`, `INTEGRATION_DATABASE_CONFIRM=finanzas-personales-ephemeral`, `INTEGRATION_DATABASE_URL`, `INTEGRATION_DATABASE_NAME` e `INTEGRATION_DATABASE_PORT`. La URL debe apuntar a `localhost`/`127.0.0.1` y a una base cuyo nombre termine en `_test` o `_integration`; nunca usa `DATABASE_URL` como fallback.

Si esas variables no están presentes, la suite API y el typecheck siguen siendo verificables, pero la evidencia E2E contra PostgreSQL queda pendiente y debe reportarse como tal.
