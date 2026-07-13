# Importación controlada de datos reales

Este flujo importa un workbook local ignorado por Git hacia la base de datos de la API con modo seguro por defecto. El nombre recomendado para uso local es `docs/importacion/local-import-workbook.xlsx`.

El archivo real **no debe commitearse**. Copia o renombra tu workbook local a esa ruta, o indica una ruta alternativa con `--workbook` o `IMPORT_WORKBOOK_PATH`.

## Estado actual

- El importador controlado existe y está cubierto por tests.
- La importación local real se ejecutó correctamente después de crear un backup y recibir confirmación explícita.
- El backup queda en una carpeta local ignorada para respaldos; no se deben documentar nombres reales, rutas sensibles ni contenido del workbook.
- Conteos post-importación: 8 cuentas, 18 categorías, 58 movimientos, 8 plantillas de compromiso, 9 compromisos y 4 metas.

## Comandos

Desde `apps/api`:

```bash
pnpm import:real-data:dry-run
```

Con ruta explícita:

```bash
pnpm import:real-data:dry-run --workbook ../../docs/importacion/local-import-workbook.xlsx
```

Ejemplos destructivos — copiar y ejecutar solo de forma intencional después de revisar el plan del dry-run:

```bash
pnpm import:real-data:apply
```

```bash
pnpm import:real-data:apply --reset
```

Flujo destructivo completo — ejecutar únicamente después de confirmar la base objetivo, tener respaldo verificable y recibir aprobación explícita:

```bash
pnpm import:real-data:apply --wipe-existing
```

- `dry-run`: valida el Excel y muestra el plan de importación sin escribir en la base de datos.
- `--workbook <ruta>`: permite usar un workbook local ignorado por Git. Si no se indica, se usa `IMPORT_WORKBOOK_PATH` o `../../docs/importacion/local-import-workbook.xlsx` desde `apps/api`.
- `--apply`: ejecuta la importación dentro de una transacción.
- `--reset`: solo se permite junto con `--apply`; elimina filas cuyos IDs coinciden con los prefijos técnicos `real-*` usados por este importador antes de volver a crearlas. No es trazabilidad de procedencia real ni auditoría histórica.
- `--wipe-existing`: solo se permite junto con `--apply`; elimina todos los datos de aplicación y luego importa el Excel dentro de la misma transacción. No elimina el esquema ni las migraciones.
- En pnpm 10, no agregues `--` antes de `--reset` o `--wipe-existing`; esos flags se pasan directamente al script.

## Seguridad

- El modo por defecto no escribe datos.
- Ningún borrado se ejecuta por defecto: `--reset` y `--wipe-existing` requieren `--apply` explícito.
- Antes de usar `--wipe-existing`, debe existir un respaldo verificable de la base objetivo.
- El borrado completo respeta el orden de dependencias de la aplicación: metas, compromisos, plantillas de compromisos, transacciones, categorías y cuentas.
- La importación falla si detecta datos importados previamente y no se usa `--reset`.
- Las filas creadas usan identificadores técnicos con prefijo `real-*` para poder repetir intentos locales de forma controlada.
- El archivo XLSX se valida con límites simples de tamaño y cantidad de entradas para evitar procesar archivos accidentalmente demasiado grandes.
- No se incluyen secretos ni credenciales en el script; se usa la configuración normal de Prisma mediante `DATABASE_URL`.

## Advertencias conocidas

- Las fechas faltantes de movimientos y transferencias se importan con la fecha técnica aprobada `2026-07-01`; no representan una fecha histórica real.
- Las plantillas recurrentes sin día de vencimiento se conservan con `diaVencimiento = null`.
- Los compromisos manuales sin fecha de vencimiento o vínculo de pago se conservan sin esos datos.
- Estos `null` son esperados para campos opcionales; no deben interpretarse como error de importación por sí solos.
