---
name: plan-extraction
description: Convierte planos de arquitectura (plantas, cortes, fachadas), renders y fotos de una casa en un house.json según el skill house-schema. Usar siempre que el usuario pase planos, láminas de anteproyecto, renders o fotos de la casa y quiera extraer paredes, aberturas, ambientes o estilo; también para regenerar solo el bloque style a partir de fotos nuevas, para corregir una extracción previa o cuando mencione "pasar el plano a JSON", aunque no nombre este skill.
---

# plan-extraction

Objetivo: un `house.json` que cumpla **exactamente** el schema de `house-schema` (leer su `SKILL.md` y `references/schema.ts` antes de empezar). La salida pasa después por `validate_house.py`, así que es preferible un JSON fiel con incertidumbres bien anotadas que uno "prolijo" con datos inventados: el validador corrige detalles de geometría, pero no puede detectar una cota inventada.

## Entradas

- **Planos**: plantas (actual y/o propuesta), cortes, fachadas. La planta es la fuente principal de geometría; los cortes, de alturas.
- **Renders**: referencia de materiales y colores de lo nuevo. No sirven para medir.
- **Fotos del exterior**: referencia de materiales y colores de lo existente. Pueden no estar; en ese caso el estilo sale de los renders y se anota.

## Procedimiento

1. **Escala.** Buscar cotas escritas y usarlas como fuente de verdad. Medir en píxeles solo lo no acotado, y registrarlo en `uncertainties`. Completar `meta.scale_reference` con la cota usada y `meta.image_calibration` (px/m y píxel del origen) de la lámina principal: el validador lo usa para dibujar el overlay de control.
2. **Paredes.** Coordenadas del eje. Los encuentros comparten coordenadas idénticas; en encuentros en T, partir la pared pasante. Espesores desde cotas o dibujo (referencia usual: 0.10–0.15 tabiques, 0.20–0.30 exteriores).
3. **Status.** Leer la leyenda de la lámina. Convención habitual en Uruguay y Argentina: **negro/gris = existente, rojo = a construir, amarillo = a demoler** — confirmarla contra la leyenda real antes de aplicarla. Si hay planta actual y propuesta, fusionarlas en un solo modelo con status. Si la lámina no distingue, anotarlo.
4. **Aberturas.** Puerta = arco de giro; ventana = líneas finas dentro del muro; corrediza = hojas superpuestas. `offset` desde `wall.start`. Alturas desde cortes o fachadas. Si faltan: puertas 2.10; ventanas sill 0.90 / height 1.10; en baño y cocina sill 1.40. Todo valor asumido va a `uncertainties`.
5. **Ambientes.** Polígono por las caras interiores, antihorario, con el nombre del plano.
6. **Alturas.** Desde cortes; si no hay, `default_wall_height = 2.60` y anotarlo.
7. **Estilo.** Fotos → lo existente; renders → lo nuevo. Si se contradicen, anotarlo en `notes`. Estimar los hex en zonas bien iluminadas, evitando sombras, reflejos y balance de blancos raro.
8. **Sitio.** `north_deg` desde la flecha de norte de la lámina (si no hay, 0 y anotarlo). `latitude` si el usuario da la ubicación o figura en la lámina (si no, omitirla). `lot` y `street_edge` desde la planta de ubicación o el contorno del padrón si aparecen; si no, omitirlos. `environment`: el que mejor describa el entorno real según fotos o renders (`suburb` si no hay datos).
9. **Muebles.** No es tarea de este skill: dejar `furniture: []`. El amueblado es un paso aparte que parte del JSON ya validado. Excepción: si el usuario lo pide explícitamente, relevar los muebles dibujados en planta con `source: "plan"` y claves del catálogo de `house-schema`.

## Autochequeo antes de responder

- Toda `opening.wall` existe y `offset + width <= largo de la pared`.
- Ningún extremo de pared cae en medio de otra pared (partir en T).
- Polígonos cerrados, sin cruces, antihorarios.
- Coordenadas redondeadas a 0.01 m; ids únicos y consecutivos (`w`, `o`, `r`).
- Cada valor asumido tiene su entrada en `uncertainties`.

## Salida

- Solo el JSON válido, sin texto antes ni después y sin fences, salvo que el usuario pida explicaciones. Si hay acceso al filesystem, escribirlo en `house.json` y resumir en 2–3 líneas cuántos elementos y cuántas incertidumbres hay.
- **No inventar.** Un tramo ilegible se modela con lo mínimo razonable y va a `uncertainties` con `confidence: "low"`.

## Modos especiales

- **Salida por partes.** Si el JSON puede quedar truncado (casa grande, muchas láminas), entregar en este orden y en mensajes separados: `meta` + `walls`, luego `openings`, luego `rooms` + `style`. Mantener ids estables entre partes.
- **Solo estilo.** Si el usuario pasa fotos nuevas para una casa ya extraída, regenerar únicamente `style` (y `rooms[].floor` si las fotos muestran pisos), sin tocar geometría ni ids.
- **Corrección.** Si el usuario marca un error o pasa el reporte del validador, corregir solo los elementos señalados y mantener el resto idéntico, para que el diff sea revisable.
