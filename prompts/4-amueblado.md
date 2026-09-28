# Prompt 4 — Amueblado (Claude Code)

Se corre sobre el JSON ya validado. Se puede repetir las veces que quieras, porque solo reemplaza el bloque `furniture`.

```text
Amueblá la casa. Especificación: skill house-schema (FurnitureItem, convención de
rotación y references/furniture-catalog.md). Contexto en CLAUDE.md.

Entrada: viewer/public/house.json (validado) y los renders en data/renders/.
[Opcional: muebles que ya tengo y me quedo, con ambiente y posición aproximada: ...]

Criterios:
1. Lo que se ve en los renders va con source "render", en la posición y orientación
   que muestra el render, contrastada con el plano.
2. Los muebles que te indiqué que me quedo van con status "existing" y source "user".
3. Los ambientes sin render se amueblan con source "suggested", de forma coherente con
   su nombre y sus medidas.
4. Ergonomía: circulaciones de 0.80 m o más; nada en el barrido de puertas ni
   bloqueando ventanas bajas; paso de 0.60 m a los lados de la cama; sofá a 2–3 m de la
   TV; 0.90 m entre mesada e isla o muebles enfrentados; sillas de comedor con 0.75 m
   libres detrás.
5. Solo claves del catálogo. Si hace falta un mueble que no existe, proponeme la clave
   nueva con medidas y no la uses hasta que la apruebe.

Pasos:
1. Proponé primero, por ambiente, una lista de muebles con su criterio (1–2 líneas por
   ambiente). Esperá mi OK.
2. Escribí solo el bloque furniture en viewer/public/house.json, sin tocar nada más.
3. Corré el validador y resolvé todos los warnings de muebles (superposición, fuera
   del ambiente, barrido de puertas).
4. Sacá una captura en primera persona desde la entrada de cada ambiente (según
   visual-testing.md) y mostrámelas.

Entregá: archivos modificados, ZIP y "Estado actual" actualizado en CLAUDE.md.
```
