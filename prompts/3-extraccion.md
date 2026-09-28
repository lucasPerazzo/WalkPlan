# Prompt 3 — Planos → JSON (Claude Code)

Antes: poné los planos en `data/planos/` (PNG o PDF en la mejor resolución que tengas), los renders en `data/renders/` y, si hay, las fotos en `data/fotos/`.

```text
Extraé la casa a JSON usando el skill plan-extraction (y house-schema para el formato).
Contexto en CLAUDE.md.

Insumos:
- data/planos/   → geometría, alturas, status (leyenda), norte y terreno
- data/renders/  → estilo de lo nuevo
- data/fotos/    → estilo de lo existente (puede estar vacía; en ese caso anotalo)

Pasos:
1. Listá qué láminas encontraste y qué información sacás de cada una (planta, cortes,
   fachadas, ubicación, leyenda, flecha de norte). Si falta algo clave, decímelo
   antes de extraer.
2. Extraé a extraction/house.raw.json con furniture = [].
3. Corré el validador con preview:
   python validator/validate_house.py extraction/house.raw.json --out viewer/public/house.json --preview <planta> --preview-out validator/overlay.png
4. Si hay errores, corregí solo los elementos señalados y repetí hasta 0 errores.
5. Mirá overlay.png y comparalo con el plano. Corregí desplazamientos evidentes.

Regla: no resuelvas incertidumbres inventando datos. Si algo no se puede leer, queda en
meta.uncertainties.

Entregá:
- un resumen de 5 líneas (paredes, aberturas, ambientes, incertidumbres por nivel);
- los warnings que quedaron y por qué los considerás aceptables;
- una lista de preguntas concretas para el arquitecto, una por cada incertidumbre
  "low" (ej: "¿altura de antepecho de la ventana del baño?");
- lista de archivos, ZIP y "Estado actual" actualizado en CLAUDE.md.
```
