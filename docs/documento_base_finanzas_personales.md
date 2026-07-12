# Documento Base — App de Finanzas Personales

**Proyecto**: Finanzas Personales (nombre tentativo)
**Fecha**: 04 de julio de 2026
**Autor**: Equipo del proyecto
**Estado**: MVP funcional avanzado — documentación actualizada al 12 de julio de 2026

> Nota de privacidad: los nombres de cuentas, contextos y ejemplos financieros de este documento son genéricos y no representan datos personales reales.

---

## 1. El problema real

El workflow actual para gestionar finanzas personales tiene fricción significativa:

1. Anotar movimientos en Obsidian (texto libre, lento, no estructurado)
2. Pasar el texto a ChatGPT para estructurarlo
3. Pulir el resultado con Claude
4. Actualizar el Excel manualmente

Este proceso toma tiempo, depende de tres herramientas distintas, y el dolor principal es que **anotar en Obsidian es lento** — no fue diseñado para ingreso rápido de transacciones financieras.

**Lo que el workflow actual sí resuelve bien** (y que la app debe preservar):
- Visión de "disponible para gastar" en tiempo real
- Separación entre compromisos fijos y gasto discrecional
- Seguimiento de metas de ahorro con progreso
- Registro de múltiples cuentas en un solo lugar

---

## 2. La solución

Una app web progresiva (PWA) de uso personal que reemplaza el workflow de tres herramientas con una sola interfaz optimizada para:

- **Ingreso rápido de movimientos** desde el celular (menos de 10 segundos)
- **Dashboard unificado** con todas las cuentas y visión general instantánea
- **Seguimiento de metas** de ahorro con progreso visual
- **Gestión de compromisos** mensuales con estado pagado/pendiente

### Lo que NO es este proyecto

- No es un banco ni se conecta a APIs bancarias
- No es una app para múltiples usuarios ni finanzas compartidas (por ahora)
- No es un sistema contable — es una herramienta de control personal

---

## 3. Contexto del usuario

**Usuario primario**: persona administradora de sus finanzas personales (uso individual)

**Cuentas actuales**:
| Cuenta | Tipo | Uso |
|--------|------|-----|
| Cuenta operativa principal | Operativa principal | Ingresos y gastos diarios |
| Tarjeta de crédito | Deuda | Compromisos de corto plazo |
| Cuenta de ahorro | Ahorro + operativa | Reservas y compras frecuentes |
| Cuenta secundaria | Secundaria | Uso esporádico |
| Reserva emergencia | Reserva | Fondo de emergencia |
| Cuenta variable 1 | Variable | En evaluación |
| Cuenta variable 2 | Variable | En evaluación |
| Cuenta inactiva | Inactiva | Sin uso actual |

**Frecuencia de uso esperada**: diaria (actualmente registra en Obsidian todos los días)

**Dispositivo principal**: iphone (celular)

**Características del usuario de prueba**: el mismo desarrollador — validación inmediata sin necesidad de testing externo en V1.

---

## 4. Las 4 preguntas que la app debe responder siempre

1. **¿Cuánto puedo gastar hoy?** → Disponible para gastar (saldo total - compromisos pendientes - reservas)
2. **¿Cómo voy con mis metas de ahorro?** → Progreso visual por meta con proyección
3. **¿En qué estoy gastando más?** → Breakdown por categoría del mes
4. **¿Cuánto debo y cuándo vence?** → Compromisos pendientes ordenados por urgencia

---

## 5. Restricciones reales

| Restricción | Valor | Implicación |
|-------------|-------|-------------|
| Horas disponibles | ~10 hrs/semana | Scope acotado, iteración incremental |
| Capital inicial | $0 | Hosting gratuito o mínimo (~$7/mes Railway) |
| Objetivo | Reemplazar workflow Obsidian+IA en 1 mes | Gate de validación concreto |
| Usuarios V1 | 1 (el propio desarrollador) | Sin auth compleja, sin multi-tenant |

---

## 6. Stack técnico

| Capa | Tecnología | Razón |
|------|------------|-------|
| Frontend | React + TypeScript | Stack conocido, sin curva de aprendizaje |
| Backend | Node.js + Express | Stack conocido |
| Base de datos | PostgreSQL | Simple, relacional, suficiente |
| Hosting | Railway (~$7/mes) | Ya familiar del proyecto Carioca |
| Mobile | PWA (Progressive Web App) | Funciona en Android sin publicar en Play Store |
| Auth | Sin auth en V1 (uso local) o Google OAuth simple | Overkill implementar auth completa en V1 |

---

## 7. Modelo de datos (diseño inicial)

### Entidades principales

**Cuenta** (Account)
- id, nombre, tipo (operativa / ahorro / deuda / reserva), saldo_actual, moneda, activa, notas

**Movimiento** (Transaction)
- id, cuenta_id, tipo (ingreso / gasto / transferencia / reserva), monto, descripcion, categoria, fecha, cuenta_destino_id (para transferencias entre cuentas propias)

**Compromiso** (Commitment)
- id, nombre, tipo (recurrente / deuda / variable), monto, estado (pagado / pendiente), fecha_vencimiento, mes, año

**Meta** (Goal)
- id, nombre, monto_objetivo, cuenta_id (cuenta donde está el dinero), estado (activa / pausada / completada), notas
- El progreso no se guarda en la meta: se calcula desde `saldo` de la cuenta asociada dividido por `monto_objetivo`.

**Categoría** (Category)
- id, nombre, icono, tipo (gasto / ingreso)

### Categorías iniciales (basadas en movimientos reales)

Gastos: Auto, Alimentación, Delivery, Familia, Entretenimiento, Salud, Servicios, Suscripciones, Efectivo, Otro

Ingresos: Ingreso principal, Transferencia recibida, Otro

### Cálculo de "Disponible para gastar"

```
Disponible =
  Suma(saldos cuentas operativas)
  - Suma(compromisos pendientes del mes)
  - Suma(saldos cuentas de reserva/ahorro)
```

---

## 8. Scope V1 — MVP

### Incluido

- Dashboard: disponible para gastar, patrimonio líquido, ingresos vs gastos del mes, resumen de metas
- Ingreso rápido de movimientos (gasto / ingreso / transferencia entre cuentas propias)
- Listado de movimientos del mes con filtro por cuenta y categoría
- Gestión de cuentas (crear, editar saldo, activar/desactivar)
- Compromisos mensuales con estado pagado/pendiente
- Seguimiento de metas con barra de progreso
- PWA instalable en Android

### Estado de entrega V1

| Área | Estado | Notas |
|---|---|---|
| Dashboard | ✅ Corregido | Cálculos conectados a API/Prisma; transferencias internas excluidas de ingresos/gastos reales. |
| Cuentas | ✅ CRUD completo | Crear, editar, activar/desactivar y ajuste operativo de saldo disponibles. |
| Movimientos | ✅ CRUD completo | Incluye comportamiento consciente de pares de transferencia para no romper saldos ni duplicar lectura visual. |
| Metas | ✅ CRUD + estados completo | Progreso calculado desde la cuenta asociada. |
| Compromisos | ✅ Completo para V1 operativa | CRUD, selector de mes, plantillas recurrentes, pago y reversa segura implementados. Editar una plantilla no muta compromisos ya generados; la UI avisa si el compromiso del mes visible ya existe. |
| PWA | 🔲 Pendiente | Manifest, instalación móvil, iconos y offline básico siguen en backlog V1. |

### Excluido de V1 (backlog)

- Importación de Excel bancario (V2)
- Gráficos de análisis por categoría (V2)
- Conexión automática a bancos (V3 o nunca)
- Multi-usuario / finanzas compartidas (V3)
- Notificaciones / recordatorios (V2)
- Exportación de datos (V2)

---

## 9. Fases y gates

| Fase | Objetivo | Criterio de éxito |
|------|----------|-------------------|
| **Fase 0** (ahora) | Documentación y diseño | Documento base + diseño de UI + esquema DB completos |
| **Fase 1** (~4-6 semanas) | MVP funcional | Reemplazar Obsidian completamente durante 1 mes |
| **Gate V1** (mes 2) | Validación de uso real | ¿Seguís usándola sin esfuerzo de acordarte? |
| **Fase 2** (si V1 pasa) | Importación Excel | Subir movimientos del banco, conciliación automática |
| **Fase 3** (si V2 pasa) | Análisis y proyecciones | Gráficos, proyección de metas, alertas |

**Gate más importante**: Al final del primer mes de uso real, ¿el workflow mejoró o es igual de engorroso que Obsidian? Si mejoró, continuar. Si no, rediseñar antes de agregar features.

---

## 10. Diferencias clave con proyectos anteriores

| | Carioca Online | Finanzas Personales |
|--|----------------|---------------------|
| Usuario | Hipotético (grupo demo) | Real (usuario objetivo actual) |
| Frecuencia de uso | Ocasional (sesiones demo) | Diaria |
| Dolor validado | No (el grupo demo prefirió otra dinámica) | Sí (workflow actual es lento) |
| Complejidad técnica | Muy alta (multiplayer, WS, reconexión) | Baja-media (CRUD + cálculos) |
| Barra de calidad mínima | Muy alta (Pokemon TCG Pocket) | Funcional es suficiente para V1 |
| Riesgo principal | Demanda no validada | Ninguno significativo en V1 |

---

## 11. Próximas acciones

1. **Checklist de entrega V1** — ejecutar validación manual pendiente, deuda UX menor y flujo diario completo antes de uso real sostenido.
2. **PWA** — manifest, instalación móvil, iconos y offline básico si hace falta para uso real.
3. **Opcionales post-MVP** — evaluar atajo "Agregar a esta meta", mejoras de búsqueda/scroll en movimientos y scripts raíz para levantar web + API juntos.

### Verificación recomendada

Para cambios funcionales, ejecutar los checks relevantes del área modificada:

```bash
cd apps/api && pnpm typecheck && pnpm test
cd apps/web && pnpm typecheck && pnpm test
```

Para cambios de documentación, basta revisar el diff Markdown si no hay linter de docs configurado.

---

*Documento generado el 04 de julio de 2026 como punto de partida para el diseño técnico del proyecto.*
