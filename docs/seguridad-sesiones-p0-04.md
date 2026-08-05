# Política de sesiones — P0-04

## Política vigente

- Las sesiones son JWT almacenadas en una cookie `HttpOnly`.
- La duración se firma explícitamente con `AUTH_SESSION_MAX_AGE_SECONDS`.
- El valor debe ser un entero positivo de hasta 28.800 segundos (8 horas).
- Cada `User` mantiene `sessionVersion`, cuyo valor inicial es `0`.
- El JWT incluye `sessionVersion`; cada request autenticado verifica firma, expiración, claims y la versión persistida en la base de datos.
- `POST /auth/logout` incrementa `sessionVersion` para el usuario del token válido y limpia la cookie. Esto revoca todas las sesiones activas de ese usuario, no solo el dispositivo actual.
- Tokens vencidos, firmados con otro secreto, malformados o con claims/versiones inválidas reciben el mensaje público genérico `Authentication required.`

## Límites explícitos

- No existe revocación selectiva por dispositivo en esta etapa.
- No existe endpoint de cambio de contraseña ni deshabilitación de usuario en esta etapa. Esos eventos no se implementan ni se simulan aquí; si se agregan posteriormente, deben incrementar `sessionVersion` dentro de la misma operación de revocación.
- La migración solo agrega una columna con valor por defecto. No contiene backfill de datos de negocio ni debe ejecutarse contra producción desde esta tarea.
