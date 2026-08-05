# Plan de publicación privada o limitada

Este documento define las prioridades, condiciones de salida y controles necesarios para publicar **Finanzas Personales** para un grupo reducido de usuarios. El objetivo no es convertir todavía el proyecto en un producto público de gran escala, sino exponerlo de forma controlada, segura y reversible.

## Objetivo de esta etapa

Publicar una primera versión limitada que permita validar:

- estabilidad funcional con usuarios reales;
- experiencia de uso fuera del entorno local;
- comportamiento de autenticación y ownership;
- operación, copias de seguridad y recuperación;
- errores y necesidades que no aparecen durante el desarrollo local.

La publicación debe ser **privada o mediante invitación**, con pocos usuarios y capacidad de retirar el acceso rápidamente.

## Estado de partida

La aplicación cuenta con una base funcional avanzada para un MVP local:

- autenticación basada en sesión JWT mediante cookie;
- separación de datos por usuario;
- cuentas, movimientos, objetivos y compromisos;
- préstamos integrados en API y Web;
- persistencia mediante Prisma y migraciones;
- pruebas automatizadas y documentación de verificación;
- ejecución local de API y Web.

La aplicación **no debe considerarse lista para exposición pública general** hasta completar las prioridades de este documento.

## Criterio de prioridad

Las prioridades están ordenadas por riesgo. No conviene ampliar funcionalidades mientras permanezcan pendientes los elementos de las prioridades 0 y 1.

| Prioridad | Resultado esperado | Regla |
|---|---|---|
| P0 | Seguridad mínima y consistencia de datos | Bloquea cualquier publicación |
| P1 | Deploy reproducible y recuperación operativa | Bloquea una publicación para usuarios externos |
| P2 | Validación controlada con usuarios | Necesaria para una beta limitada |
| P3 | Mejoras de producto y escala | Posterior a la primera beta |

## P0 — Bloqueantes antes de publicar

### 1. Resolver la consistencia de Loans

- [ ] Revisar `apps/api/src/integration/authOwnershipPostgres.integration.test.ts`.
- [ ] Confirmar si `Loan.entregaTransactionId` debe ser obligatorio según el dominio.
- [ ] Corregir el fixture o ajustar schema/migración si la regla de negocio fuera diferente.
- [ ] Ejecutar la integración contra una base efímera autorizada.
- [ ] Confirmar que las pruebas no reportan verde con datos incompatibles con producción.

**Criterio de salida:** schema, migraciones, fixtures y pruebas expresan la misma regla.

### 2. Cerrar CORS, orígenes y cookies

- [ ] Definir los dominios definitivos de Web y API.
- [ ] Sustituir CORS abierto por una lista explícita de orígenes permitidos.
- [ ] Confirmar `credentials` en las solicitudes que usan cookies.
- [ ] Revisar `SameSite`, `Secure`, dominio y expiración de la cookie JWT.
- [ ] Probar login, sesión persistente y logout desde el dominio real.
- [ ] Verificar que un origen no autorizado no pueda realizar solicitudes autenticadas.

**Criterio de salida:** el flujo de autenticación funciona desde el dominio de publicación y falla correctamente desde orígenes no permitidos.

### 3. Proteger el acceso a la cuenta

- [ ] Añadir rate limiting al login.
- [ ] Definir límites razonables por IP y por cuenta.
- [ ] Evitar mensajes que permitan enumerar usuarios.
- [ ] Revisar headers HTTP de seguridad.
- [ ] Confirmar que errores de producción no exponen stack traces, secretos ni datos sensibles.
- [ ] Revisar logs para que no impriman credenciales, cookies, tokens ni información financiera innecesaria.

**Criterio de salida:** existe una prueba o verificación reproducible para abuso básico del login y exposición accidental de información.

### 4. Revisar el ciclo de vida de las sesiones

- [ ] Documentar el riesgo actual: logout limpia la cookie, pero no revoca tokens JWT ya emitidos.
- [ ] Definir expiración corta o razonable para los access tokens.
- [ ] Decidir si la beta necesita revocación server-side, rotación o sesiones persistidas.
- [ ] Permitir invalidar sesiones ante cambio de contraseña, bloqueo o incidente.
- [ ] Probar expiración, logout y acceso con token vencido.

**Criterio de salida:** la decisión sobre revocación está tomada y documentada; no debe quedar implícita.

## P1 — Preparación operativa

### 5. Hacer reproducible el deploy

- [ ] Elegir proveedor y arquitectura inicial para Web, API y base de datos.
- [ ] Documentar los comandos exactos de build, migración y arranque.
- [ ] Definir variables de entorno de producción en `.env.example` sin incluir secretos reales.
- [ ] Separar claramente desarrollo, staging y producción.
- [ ] Configurar HTTPS obligatorio.
- [ ] Definir una estrategia de migraciones compatible con rollback.
- [ ] Documentar cómo volver a la versión anterior.

**Criterio de salida:** otra persona puede desplegar la aplicación siguiendo el runbook, sin conocimiento implícito del entorno local.

### 6. Configurar CI y verificaciones automáticas

- [ ] Ejecutar typecheck, lint, build y pruebas en CI.
- [ ] Ejecutar las pruebas de integración con una base efímera cuando corresponda.
- [ ] Bloquear despliegues si fallan las verificaciones obligatorias.
- [ ] Verificar que las migraciones se validan antes de tocar producción.
- [ ] Guardar artefactos y logs de cada ejecución.

**Criterio de salida:** un cambio no puede llegar al entorno limitado saltándose las comprobaciones básicas.

### 7. Backup y restauración

- [ ] Configurar backups automáticos de la base de datos.
- [ ] Definir retención y ubicación separada del servidor principal.
- [ ] Probar una restauración completa en un entorno aislado.
- [ ] Documentar qué datos se recuperan y cuáles no.
- [ ] Definir el responsable y el procedimiento ante pérdida o corrupción de datos.

**Criterio de salida:** existe evidencia reciente de una restauración exitosa, no solo de que el backup fue creado.

### 8. Observabilidad mínima

- [ ] Registrar disponibilidad de API y Web.
- [ ] Configurar un health check que no exponga información sensible.
- [ ] Centralizar errores de servidor.
- [ ] Medir errores HTTP, latencia y fallos de autenticación.
- [ ] Configurar alertas básicas para caída del servicio y errores repetidos.
- [ ] Definir qué información no debe almacenarse en logs.

**Criterio de salida:** ante un fallo, se puede saber que ocurrió, cuándo ocurrió y qué componente está afectado.

## P1 — Datos iniciales y acceso limitado

### 9. Definir cómo se habilitan usuarios

- [ ] Elegir registro abierto, invitación o alta manual.
- [ ] Para la primera beta, preferir invitaciones o alta controlada.
- [ ] Resolver el placeholder del hash en `seed-data.js`.
- [ ] No reutilizar credenciales de desarrollo.
- [ ] Definir cómo se deshabilita una cuenta.
- [ ] Documentar el procedimiento para eliminar un usuario y sus datos, si corresponde.

**Criterio de salida:** solo entran usuarios autorizados y existe una forma clara de retirar el acceso.

### 10. Validar migraciones y datos existentes

- [ ] Ejecutar el runbook de migración/backfill en un entorno equivalente al de publicación.
- [ ] Verificar constraints y ownership después de la migración.
- [ ] Confirmar que no existen datos huérfanos o asignados a usuarios incorrectos.
- [ ] Realizar un backup antes de cualquier migración productiva.
- [ ] Documentar un plan de rollback o recuperación.

**Criterio de salida:** la base de datos inicial está validada y puede recuperarse si el proceso falla.

## P2 — Beta limitada

La primera publicación debería ser deliberadamente pequeña:

- [ ] Entre 1 y 5 usuarios iniciales.
- [ ] Acceso por invitación o cuentas creadas manualmente.
- [ ] Sin promesa de disponibilidad permanente.
- [ ] Sin datos financieros críticos hasta validar backups y recuperación.
- [ ] Canal directo para reportar errores.
- [ ] Registro de incidencias y decisiones de soporte.
- [ ] Revisión semanal de errores, rendimiento y experiencia.

### Pruebas de aceptación manual

- [ ] Registro o alta de usuario.
- [ ] Login correcto.
- [ ] Login fallido sin filtración de información.
- [ ] Persistencia de sesión.
- [ ] Logout y expiración.
- [ ] Creación, edición y eliminación de movimientos.
- [ ] Verificación de que un usuario no puede leer ni modificar datos de otro.
- [ ] Cuentas y saldos.
- [ ] Objetivos.
- [ ] Compromisos y operaciones de pago/deshacer pago.
- [ ] Loans y transacciones asociadas.
- [ ] Comportamiento con formularios incompletos y errores de red.
- [ ] Restauración de backup en entorno aislado.
- [ ] Visualización correcta en móvil y escritorio.

## P3 — Posterior a la primera beta

Estas mejoras son valiosas, pero no deben desplazar los bloqueantes:

- PWA, manifest y service worker si la experiencia móvil lo requiere.
- Revocación avanzada y gestión de sesiones múltiples.
- Recuperación de contraseña y verificación de correo.
- Mejoras de accesibilidad.
- Analítica de uso respetuosa con la privacidad.
- Automatización de releases.
- Escalado y optimización de rendimiento.
- Nuevos módulos financieros.

## Alcance explícitamente fuera de esta publicación

- No se busca una apertura pública general.
- No se busca soporte multi-tenant complejo.
- No se busca disponibilidad 24/7.
- No se deben aceptar datos de terceros sin consentimiento y política de privacidad adecuada.
- No se deben prometer garantías de recuperación hasta haber probado la restauración.
- No se deben añadir módulos nuevos como sustituto de cerrar los riesgos P0 y P1.

## Puerta de salida para publicar

La versión privada o limitada puede publicarse únicamente cuando se cumpla todo lo siguiente:

- [ ] No quedan bloqueantes P0 abiertos.
- [ ] CORS, cookies y HTTPS fueron probados desde los dominios reales.
- [ ] El login tiene protección básica contra abuso.
- [ ] El deploy es reproducible y está documentado.
- [ ] Existe backup automático y restauración probada.
- [ ] Las pruebas CI obligatorias están activas.
- [ ] El alta y retiro de usuarios están controlados.
- [ ] Las migraciones fueron verificadas en un entorno equivalente.
- [ ] Existe monitorización mínima y canal de incidentes.
- [ ] Se completó la aceptación manual de los flujos críticos.
- [ ] Se definió cómo detener o revertir la beta.

## Recomendación final

La siguiente unidad de trabajo debería ser una **ventana de preparación de publicación**, no una nueva funcionalidad. El orden recomendado es:

1. corregir Loans y validar las pruebas;
2. cerrar autenticación, CORS, cookies y rate limiting;
3. preparar deploy, CI, backups y restauración;
4. ejecutar aceptación manual;
5. publicar con pocos usuarios y observar;
6. convertir los hallazgos de la beta en el siguiente ciclo de trabajo.

El éxito de esta etapa no se mide por la cantidad de funcionalidades, sino por poder responder afirmativamente a tres preguntas: **¿quién puede entrar?, ¿sus datos están aislados?, ¿podemos recuperar el sistema si algo falla?**
