# Prompt 2 — Validador (Claude Code)

```text
Escribí validator/validate_house.py según el skill house-schema (schema v2, invariantes
y warnings de ese skill). Contexto en CLAUDE.md.

Uso:
python validator/validate_house.py <in.json> --out <out.json> [--grid 0.05]
  [--merge-tol 0.10] [--preview <plano.png> --preview-out <overlay.png>]

Dependencias: pydantic v2, shapely y matplotlib (solo para preview). Nada más.
Los modelos pydantic se derivan de house-schema/references/schema.ts; las claves de
muebles válidas se leen de references/furniture-catalog.md (parsear la tabla).

Correcciones automáticas, cada una registrada en el reporte:
- Snap de coordenadas de paredes, rooms y sitio a la grilla (los muebles no).
- Unir extremos de paredes a menos de merge-tol (clustering al promedio).
- Encuentros en T: partir la pared pasante y reasignar sus aberturas recalculando offset.
- Eliminar paredes de largo < 0.05.
- Normalizar polígonos (rooms y lot) a antihorario y sin punto de cierre duplicado.
- Completar height faltante con meta.default_wall_height.
- Migrar un JSON v1 a v2 (furniture = [], site con environment "suburb" y north_deg 0).

Errores → exit code 1. Warnings → exit code 0. Separar los dos niveles como define
el skill. Para muebles, usar la huella rotada (ancho × profundidad del catálogo × scale)
y la zona de barrido de cada puerta (cuarto de círculo de radio = ancho, del lado de
apertura; si no se sabe el lado, ambos).

Salida: reporte en consola agrupado en errores / warnings / correcciones, con ids;
además report.json junto al out.

Preview: dibujar sobre la imagen del plano, usando meta.image_calibration (ojo: y de
la imagen va hacia abajo), las paredes coloreadas por status, las aberturas, los rooms
y las huellas de los muebles.

Estructura: una función pura por chequeo o corrección; tests con pytest en
validator/tests con casos mínimos para cada una, más un test que valide
house.example.json sin errores ni warnings.

Antes de escribir código, mostrame el plan y esperá mi OK. Al terminar: tests en verde,
lista de archivos, ZIP y "Estado actual" actualizado en CLAUDE.md.
```
