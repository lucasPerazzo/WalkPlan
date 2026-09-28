---
name: house-schema
description: Contrato de datos (schema JSON v3) de la casa para el proyecto de recorrido 3D de la reforma — paredes, aberturas, ambientes, muebles, entorno/terreno, estilo, convención de coordenadas y reglas de validación. Usar SIEMPRE que se lea, genere, valide, convierta o renderice un house.json, que se extraiga geometría de planos, que se escriba el validador en Python o cualquier código de la app React Three Fiber que consuma el modelo, aunque el usuario no nombre el schema. Es la fuente de verdad compartida; ante cualquier duda sobre un campo o una convención, consultar este skill antes de suponer.
---

# house-schema

Contrato único entre las cuatro piezas del proyecto:

1. **Extracción** (planos + renders + fotos → `house.json`, geometría y sitio) — skill `plan-extraction`.
2. **Validación** (`validate_house.py`, Python) — corrige y reporta.
3. **Visor 3D** (React Three Fiber) — skill `r3f-arch-viz`.
4. **Amueblado** (house.json validado + renders → bloque `furniture`) — prompt de amueblado.

Si las piezas no interpretan el JSON exactamente igual, los errores aparecen como paredes corridas o aberturas en el lugar equivocado y son difíciles de rastrear. Por eso las convenciones de abajo no se reinterpretan localmente: si hace falta cambiarlas, se cambia este skill.

## Archivos

- `references/schema.ts` — tipos TypeScript completos y comentados (v2). Leerlo antes de escribir o leer un house.json.
- `references/furniture-catalog.md` — claves válidas de muebles con medidas nominales. Leerlo antes de escribir o renderizar `furniture`.
- `assets/house.example.json` — casa mínima válida (dos ambientes, una pared nueva, puerta, ventana, cuatro muebles, sitio suburbano). Usarla como fixture de tests y como dato de arranque del visor.

## Convenciones (resumen)

**Unidades:** metros en todo. Colores en hex `#rrggbb`.

**Coordenadas del plano:** origen en la esquina inferior izquierda del contorno exterior de la casa. `x` crece hacia la derecha y `y` hacia arriba de la lámina (no como en una imagen, donde `y` crece hacia abajo).

**Mapeo a Three.js:** `(x, y)` del plano → `(x, altura, -y)`. El eje Y de Three es vertical. Con este mapeo, un `ShapeGeometry` construido con los puntos del plano y rotado `-π/2` en X queda en su lugar exacto y con la normal hacia arriba.

**Paredes:** `start` y `end` están sobre el **eje** de la pared, no sobre una cara. Paredes que se encuentran comparten exactamente las mismas coordenadas en el nodo. En un encuentro en T, la pared pasante se parte en dos en ese punto: no existen extremos que caigan en medio de otra pared.

**Lado derecho / izquierdo:** mirando de `start` a `end`, la normal derecha en el plano es `(dy, -dx)/L`. Los consumidores que necesiten distinguir cara exterior de interior usan esto.

**Aberturas:** `offset` es la distancia sobre el eje desde `wall.start` hasta el borde del vano más cercano a `start`. El vano ocupa `[offset, offset + width]` en horizontal y `[sill, sill + height]` en vertical. Puertas y corredizas tienen `sill = 0`.

**Ambientes:** polígono antihorario, sin repetir el primer punto al final, trazado preferentemente por las caras interiores de las paredes (se acepta por ejes si el plano no permite más precisión, anotándolo en `uncertainties`).

**Muebles:** `position` es el centro de la huella en el plano. `rotation` en grados antihorario visto en planta; con 0° el frente del mueble mira hacia -y del plano, que en Three es +Z (el "adelante" estándar de un glTF). Por eso `rotation.y = rotation * π/180` sin más transformaciones. La huella rotada es un rectángulo ancho × profundidad del catálogo, multiplicado por `scale`. Sin `room` = mueble exterior.

**Sitio:** `environment` es solo el entorno por defecto: el usuario lo cambia en el visor sin tocar el JSON. `north_deg` orienta el sol (0 = norte arriba de la lámina). `latitude` (opcional, negativa al sur) define por dónde pasa el sol: sin ella el visor asume −35° y lo avisa. `street_edge` es el límite frontal del terreno, con la calle del lado derecho de start→end. `lot` es opcional; si falta, el visor asume un terreno alrededor del contorno con un margen razonable.

**Status:** `existing` = está hoy y queda; `new` = se construye en la reforma; `demolish` = está hoy y se tira.
- Vista **Actual** = `existing` + `demolish`.
- Vista **Reforma** = `existing` + `new`.

## Invariantes (lo que el validador garantiza y el visor puede asumir)

- ids únicos; toda `opening.wall` referencia una pared existente.
- `0 <= offset` y `offset + width <= largo de la pared`.
- Aberturas de una misma pared no se superponen.
- `sill + height <= wall.height`; puertas con `sill = 0`.
- Polígonos de ambientes simples (sin autointersección), área ≥ 1 m², antihorarios.
- Todo `furniture.catalog` existe en el catálogo; todo `furniture.room` existe.
- Si hay `lot`, contiene el contorno de la casa.
- No hay paredes duplicadas colineales ni de largo < 0.05 m.
- Coordenadas redondeadas a la grilla (default 0.05 m tras validar; 0.01 m en la salida cruda de la extracción).

El visor no debe re-validar todo esto, pero sí fallar con un mensaje claro si recibe un JSON que no lo cumple (por ejemplo, loguear el id de la abertura fuera de rango y omitirla en vez de romper la escena).

Warnings que el validador reporta pero no bloquean: extremos sueltos en paredes exteriores, contorno exterior abierto, ambientes que se salen del contorno más de 0.3 m, espesores fuera de 0.08–0.45 m, alturas fuera de 2.2–4.0 m, aberturas `new` en paredes `demolish`, muebles que se salen de su ambiente (>0.05 m), muebles superpuestos entre sí o con paredes, muebles dentro del barrido de una puerta.

## Evolución del schema

- v3 (actual): agrega `site.latitude` opcional. El validador migra v1 y v2 a v3; el visor acepta v2 y v3.

- Cualquier cambio de estructura incrementa `version` y se documenta en `references/schema.ts`.
- Un cambio al schema implica revisar los cuatro consumidores: extracción, validador, amueblado y loader del visor. Listar explícitamente qué cambió en cada uno.
- Preferir campos opcionales nuevos antes que cambiar el significado de uno existente.
