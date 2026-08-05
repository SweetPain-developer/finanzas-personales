# Protección de login P0-03

La API aplica un límite local por IP al endpoint `POST /auth/login`:

- ventana: `AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS` (por defecto, 60 segundos);
- máximo: `AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS` fallos (por defecto, 5);
- bloqueo: `AUTH_LOGIN_RATE_LIMIT_BLOCK_SECONDS` (por defecto, 300 segundos).

El quinto fallo todavía devuelve el error genérico de credenciales; los intentos posteriores durante el bloqueo devuelven `429` y `Retry-After`. Los usuarios inexistentes y las contraseñas incorrectas devuelven el mismo `401` y el mismo mensaje público: `Invalid email or password.` La verificación contra un hash Argon2 de descarte evita omitir el trabajo criptográfico cuando el usuario no existe y reduce la diferencia temporal observable.

El contador se mantiene únicamente en memoria del proceso y usa la IP observada por Express. Esta protección es adecuada para una beta limitada con una sola instancia. Antes de ejecutar varias instancias de la API se debe sustituir o complementar con almacenamiento compartido; no se debe interpretar el límite actual como distribuido.

La API también envía `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy: no-referrer`. En producción añade HSTS. No se añade CSP a la API para no imponer una política destructiva sobre el frontend. El hosting del Web debe configurar esos headers en su propia capa, además de HTTPS y HSTS; este repositorio no contiene un adaptador de hosting que permita hacerlo sin asumir un proveedor.
