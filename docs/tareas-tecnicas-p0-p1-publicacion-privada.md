# Tareas técnicas P0 y P1 para publicación privada

Este documento convierte el plan de publicación privada en tareas ejecutables. El alcance está limitado a seguridad, consistencia de datos y operación. **No se deben añadir funcionalidades de producto durante este ciclo.**

## Resultado esperado

Al finalizar estas tareas debe existir una versión que pueda desplegarse para pocos usuarios, con:

- datos aislados por usuario;
- autenticación configurada para los dominios reales;
- protección básica contra abuso;
- pruebas reproducibles;
- migraciones controladas;
- backup restaurable;
- observabilidad mínima;
- procedimiento de despliegue y reversión.

## Orden de ejecución

| Fase | Tareas | Dependencia | Bloquea publicación |
|---|---|---|---|
| P0-A | `P0-01` a `P0-03` | Ninguna | Sí |
| P0-B | `P0-04` a `P0-06` | P0-A | Sí |
| P1-A | `P1-01` a `P1-03` | P0 completo | Sí |
| P1-B | `P1-04` a `P1-06` | P1-A | Sí |

---

## P0-A — Consistencia y configuración segura

### P0-01 — Corregir y demostrar la consistencia de Loans

**Objetivo:** asegurar que schema, migraciones, código y pruebas aplican la misma regla para `entregaTransactionId`.

**Trabajo:**

- Revisar `apps/api/prisma/schema.prisma` y la migración correspondiente.
- Revisar `apps/api/src/integration/authOwnershipPostgres.integration.test.ts`.
- Confirmar si el campo es obligatorio por regla de negocio.
- Corregir el fixture para crear una transacción válida o corregir el modelo si la obligatoriedad es incorrecta.
- Añadir una aserción que demuestre el comportamiento esperado.

**Verificación:**

```bash
pnpm --dir apps/api typecheck
pnpm --dir apps/api test
```

Además, ejecutar la integración con una base PostgreSQL efímera autorizada y registrar el resultado sin exponer credenciales.

**Hecho cuando:** el fixture deja de depender de datos incompatibles y la integración valida la regla real del modelo.

### P0-02 — Cerrar CORS y el contrato de cookies

**Objetivo:** permitir solicitudes autenticadas únicamente desde los orígenes autorizados.

**Trabajo:**

- Revisar `apps/api/src/app.ts`, `apps/api/src/server.ts` y la configuración de auth.
- Introducir configuración explícita para los orígenes permitidos.
- Rechazar configuración de producción con origen comodín.
- Configurar de forma explícita `credentials`, `SameSite`, `Secure`, dominio y expiración.
- Documentar las variables requeridas en `.env.example`.
- Mantener un valor local claro para desarrollo sin reutilizarlo en producción.

**Verificación:**

- Probar login desde el origen Web autorizado.
- Probar una solicitud autenticada posterior al login.
- Probar logout.
- Probar una solicitud desde un origen no autorizado.
- Confirmar que no se imprimen cookies ni tokens en logs.

**Hecho cuando:** el flujo funciona en los dominios reales y un origen no autorizado no puede usar la sesión.

### P0-03 — Añadir protección básica al login

**Objetivo:** reducir el riesgo de fuerza bruta y enumeración de cuentas.

**Trabajo:**

- Localizar el endpoint de login y su middleware asociado.
- Aplicar límite por IP y, si es viable sin crear un mecanismo frágil, también por cuenta.
- Usar respuestas equivalentes para usuario inexistente y contraseña incorrecta.
- Definir ventana, límite y respuesta esperada para exceso de intentos.
- Añadir pruebas del límite y de la respuesta no enumerable.
- Revisar headers HTTP básicos de seguridad en la API y el hosting Web.

**Hecho cuando:** los intentos repetidos se bloquean temporalmente y la respuesta no revela si una cuenta existe.

---

## P0-B — Sesiones, datos y aceptación de seguridad

### P0-04 — Formalizar expiración y revocación de sesión

**Objetivo:** decidir y aplicar el ciclo de vida de las sesiones JWT.

**Trabajo:**

- Documentar la limitación actual: logout elimina la cookie, pero no invalida tokens ya emitidos.
- Definir la duración máxima aceptable para la beta.
- Implementar la opción mínima aprobada: expiración estricta o revocación server-side.
- Definir el comportamiento ante cambio de contraseña, deshabilitación o incidente.
- Añadir pruebas de token vencido, logout y sesión inválida.

**Hecho cuando:** la beta tiene una política explícita y comprobable para tokens vencidos y sesiones comprometidas.

### P0-05 — Validar ownership de extremo a extremo

**Objetivo:** demostrar que ningún usuario puede leer o modificar datos de otro.

**Trabajo:**

- Revisar rutas protegidas de cuentas, movimientos, objetivos, compromisos y Loans.
- Crear o completar pruebas con dos usuarios aislados.
- Cubrir lectura, creación, edición, eliminación y acciones de pago/devolución.
- Verificar respuestas esperadas para recurso inexistente y recurso perteneciente a otro usuario.
- No aceptar IDs del cliente como prueba de autorización.

**Verificación:**

```bash
pnpm --dir apps/api test
```

**Hecho cuando:** las pruebas demuestran aislamiento por usuario en cada módulo publicado.

### P0-06 — Ejecutar aceptación manual de seguridad

**Objetivo:** validar el comportamiento real que no cubren las pruebas unitarias.

**Checklist:**

- [ ] Login correcto.
- [ ] Login incorrecto sin enumeración.
- [ ] Sesión persistente en el origen autorizado.
- [ ] Logout.
- [ ] Token vencido rechazado.
- [ ] Origen no autorizado rechazado.
- [ ] Usuario A no puede consultar datos de usuario B.
- [ ] Usuario A no puede mutar datos de usuario B.
- [ ] Errores no exponen stack traces ni secretos.
- [ ] Logs no contienen credenciales, tokens, cookies ni importes innecesarios.

**Hecho cuando:** se conserva evidencia fechada de la ejecución y no quedan fallos críticos abiertos.

---

## P1-A — Build, CI y despliegue reproducible

### P1-01 — Definir el contrato de producción

**Objetivo:** eliminar dependencias implícitas del entorno local.

**Trabajo:**

- Elegir proveedor para Web, API y PostgreSQL.
- Definir dominios, HTTPS, región y estrategia de persistencia.
- Completar `.env.example` con nombres, propósito y obligatoriedad de variables.
- Separar variables de desarrollo, staging y producción.
- Definir almacenamiento seguro de secretos.
- Documentar comandos de instalación, build, migración y arranque.

**Hecho cuando:** una persona que no conoce el entorno local puede reproducir el despliegue siguiendo el documento.

### P1-02 — Automatizar las verificaciones CI

**Objetivo:** impedir que un cambio no verificado llegue a la beta.

**Trabajo:**

- Configurar instalación con `pnpm@10.0.0`.
- Ejecutar typecheck y pruebas de API.
- Ejecutar typecheck, build y pruebas de Web.
- Ejecutar integración PostgreSQL cuando exista un servicio efímero autorizado.
- Publicar logs de fallos.
- Definir la rama o condición que permite desplegar.

**Verificación local mínima:**

```bash
pnpm --dir apps/api typecheck
pnpm --dir apps/api test
pnpm --dir apps/web typecheck
pnpm --dir apps/web test
pnpm --dir apps/web build
```

**Hecho cuando:** CI falla ante type errors, tests rojos o build inválido y no permite desplegar en esas condiciones.

### P1-03 — Documentar deploy y rollback

**Objetivo:** hacer reversible cualquier publicación.

**Trabajo:**

- Documentar build de Web y API.
- Documentar aplicación de migraciones.
- Definir orden de despliegue.
- Definir health check posterior al deploy.
- Definir cómo volver a la versión anterior.
- Definir qué hacer si una migración no es compatible con rollback.
- Registrar la versión desplegada.

**Hecho cuando:** se ha realizado al menos un deploy de prueba y un rollback controlado en staging o entorno equivalente.

---

## P1-B — Recuperación y observabilidad

### P1-04 — Configurar backup y probar restauración

**Objetivo:** poder recuperar los datos ante pérdida, corrupción o error de migración.

**Trabajo:**

- Configurar backup automático de PostgreSQL.
- Definir frecuencia, retención y cifrado.
- Mantener copias fuera del servidor principal.
- Documentar el procedimiento de restauración.
- Restaurar una copia en una base aislada.
- Verificar schema, usuarios, ownership y registros restaurados.
- Registrar el tiempo real de recuperación.

**Hecho cuando:** existe una restauración exitosa documentada y se conoce el tiempo aproximado de recuperación.

### P1-05 — Añadir observabilidad mínima

**Objetivo:** detectar y diagnosticar fallos de la beta.

**Trabajo:**

- Implementar health check de API.
- Monitorizar disponibilidad de Web y API.
- Centralizar errores de servidor.
- Medir códigos HTTP, latencia y fallos de autenticación.
- Configurar alerta por caída del servicio y aumento anormal de errores.
- Redactar una política mínima de logs sin datos sensibles.

**Hecho cuando:** una caída o degradación genera una señal visible y permite identificar el componente afectado.

### P1-06 — Resolver alta, baja y seed de usuarios

**Objetivo:** controlar exactamente quién puede entrar durante la beta.

**Trabajo:**

- Elegir invitación o alta manual para la primera versión.
- Sustituir o eliminar el hash placeholder de `seed-data.js`.
- No reutilizar credenciales locales.
- Documentar creación, deshabilitación y eliminación de usuarios.
- Confirmar qué sucede con los datos al deshabilitar una cuenta.
- Probar que un usuario retirado no puede iniciar una sesión nueva.

**Hecho cuando:** el acceso puede concederse y retirarse sin editar datos manualmente de forma insegura.

---

## Puerta de salida P0/P1

No iniciar la beta hasta marcar todas estas casillas:

- [ ] `P0-01` cerrado y verificado con integración.
- [ ] `P0-02` cerrado con dominios reales.
- [ ] `P0-03` cerrado con prueba de abuso básico.
- [ ] `P0-04` cerrado con política de sesión aprobada.
- [ ] `P0-05` cerrado para todos los módulos publicados.
- [ ] `P0-06` ejecutado sin fallos críticos.
- [ ] `P1-01` documentado.
- [ ] `P1-02` activo en CI.
- [ ] `P1-03` probado en entorno equivalente.
- [ ] `P1-04` restauración comprobada.
- [ ] `P1-05` alertas mínimas activas.
- [ ] `P1-06` alta y baja controladas.

## Regla de trabajo

Cada tarea debe producir código, configuración, documentación o evidencia verificable. Si durante la ejecución aparece una nueva funcionalidad de producto, debe registrarse aparte y dejarse fuera de este ciclo.
