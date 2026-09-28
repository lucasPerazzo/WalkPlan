# Verificación visual del visor

Complementa el skill `webapp-testing` (Playwright en Python + `scripts/with_server.py`). Acá están solo las particularidades de una escena WebGL.

## 1. Hooks en la app (modo test)

Con `?test=1` en la URL, la app:

- Crea el `<Canvas>` con `gl={{ preserveDrawingBuffer: true }}`. Sin esto, la captura del canvas puede salir en negro.
- Acepta cámara por query params para capturas deterministas:
  - `view=orbit|plan|fps`
  - `x`, `y` en coordenadas del **plano**; `yaw` en grados para fps, antihorario desde +x del plano (0 = este de la lámina, 90 = hacia arriba).
  - `mobile=1` fuerza los controles táctiles.
  - `hour` (hora solar, default 11), `season=summer|equinox|winter` (default equinox) y `roof=1` (maqueta con techo).
  - `mode=actual|reforma|diff` (diff = Cambios; los `stats` son los de la Reforma)
  - `env=forest|city|suburb|countryside|beach`
  - `house=<archivo>.json`: otro JSON de `public/` en vez de `house.json` (lo usa la lámina de catálogo).
- Desactiva animaciones y el ciclo del sol (hora fija).
- Expone `window.__viewer`:

```ts
window.__viewer = {
  ready: boolean,                                  // true cuando geometría, texturas, HDRI y modelos de muebles terminaron de cargar
  stats: { walls: number, segments: number, openings: number, rooms: number, furniture: number, placeholders: number, doors: number, triangles: number },
  spawnDoor: string | null,                        // abertura usada para el punto de llegada
  player: { x: number, y: number, yaw: number, t: number } | null, // primera persona: plano + segundos simulados
  environment: { id: string, props: number, blocks: number } | null, // entorno activo y cuánto generó
  mode: 'actual' | 'reforma' | 'diff',
  changes: { newWalls, newOpenings, demolishWalls, demolishOpenings, boxes: number } | null, // vista Cambios
  measure: { plan: number[], fps: number | null, marks: number }, // cotas en metros; marks: puntos marcados en primera persona
  uncertainties: { total: number, focused: string | null }, // panel de dudas y elemento resaltado
  errors: string[],                                // elementos omitidos por datos inválidos
};
```

- En la vista planta, además, `window.__planToScreen(x, y)` devuelve los píxeles de la página de un punto del plano (para hacer clic y arrastrar muebles o medir desde Playwright). Lo publica `PlanView`.

## 2. Chromium headless con WebGL

```python
browser = p.chromium.launch(
    headless=True,
    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
)
page = browser.new_page(viewport={"width": 1280, "height": 800})
page.goto("http://localhost:5173/?test=1&view=plan")
page.wait_for_function("window.__viewer && window.__viewer.ready", timeout=30000)
page.screenshot(path="shots/plan.png")
```

Con software rendering puede ser lento; conviene subir los timeouts y no medir performance en este entorno.

Con cuadros de 0.3–1 s, las esperas fijas en tiempo real fallan:
- Esperar señales del probe (`wait_for_function`) en vez de `wait_for_timeout`.
- Lo que se acaba de montar (una herramienta que se prende) recibe clics recién después de un render: esperar un par de `requestAnimationFrame` antes de cliquear.
- "Quieto" se mide en tiempo simulado (`player.t`), no con dos lecturas separadas por tiempo real, que pueden caer en el mismo cuadro.
- `page.screenshot` con timeout amplio (120 s).

## 3. Chequeos mínimos por fase

1. **Consistencia de datos:** `__viewer.stats` coincide con lo esperado según el JSON (ej. para `house.example.json`: 7 paredes, 3 aberturas, 2 rooms, 4 muebles) y `placeholders` es 0 una vez descargados los modelos y `__viewer.errors` está vacío.
2. **Canvas no vacío:** la captura no es de un solo color. Muestrear píxeles con Pillow y exigir varianza mínima.
3. **Capturas de referencia:** `plan`, `orbit` desde las cuatro esquinas, `fps` en el spawn y parado en la puerta de entrada mirando hacia adentro, un `fps` dentro de cada ambiente amueblado, `mode=diff`, y una captura exterior por cada `env`.
4. **Muebles (fase 4):** `shots.py` arma una lámina de catálogo (`catalogo_N.png`, una casa sintética por fila con todas las claves a `rotation` 0, vistas de frente desde el sur y rotuladas): todo mueble tiene que mostrar su frente (asiento, puertas, pies de la cama) y llenar su huella en la planta. `scripts/editor_test.py` prueba el editor (arrastrar sin desplazar la vista, manija que encaja de a 15°, Q, Supr, agregar, exportar) y pasa el JSON exportado por el validador; deja `shots/editor_seleccion.png`.
5. **Entornos (fase 5):** por cada `env`, `entorno_<env>_maqueta` (orbit desde la esquina) y `entorno_<env>_afuera` (fps frente a la puerta de llegada, de espaldas a la casa), más `entorno_beach_mar` (del lado opuesto a la entrada, hacia el agua). `shots.py` chequea que `__viewer.environment.id` sea el pedido. Que nada caiga en la zona prohibida ni sobre la calle lo cubren los tests de `src/environment/generate.test.ts` (sobre el ejemplo, sin `lot`); en las capturas, mirar que no haya árboles, cercos ni edificios pegados a la casa o delante de la entrada.
6. **Actual / Cambios, medición y dudas (fase 6):** `shots.py` captura `actual_*` y `cambios_*` (planta, maqueta y living) y el techo (`techo_maqueta`, `techo_frente`). `scripts/tools_test.py` prueba: los conteos de Cambios y de Actual contra el JSON; una cota en planta de cara a cara (clics a 5 cm de cada cara) que tiene que dar el ancho del ambiente; en primera persona, M frente a un muro ciego, desplazarse de costado y M otra vez = lo recorrido; y que elegir una duda lleve a la planta con su elemento resaltado. Deja `herramientas_cota.png` y `herramientas_dudas.png`.
7. **Prueba de marcha** (`viewer/scripts/walk_test.py`): con W apretada, una pared y una puerta cerrada frenan, la misma puerta abierta con E deja pasar y la velocidad ronda 1.4 m/s. Se mide en tiempo simulado (`__viewer.player.t`) y desde que el jugador arranca: con render por software hay cuadros de 0.3–1 s y la tecla tarda uno o dos cuadros en llegar.
8. **Mirar las capturas.** Buscar paredes giradas, huecos en esquinas, aberturas en el lado equivocado, pisos faltantes, texturas estiradas, muebles girados o fuera de escala, props del entorno dentro del terreno, y comparar la vista `plan` contra la lámina del plano original.

## 4. Overlay contra el plano

Si `meta.image_calibration` existe, la vista `plan` con cámara ortográfica encuadrada al mismo rectángulo que la lámina permite superponer la captura sobre el plano (Pillow, alpha 0.5) y detectar desplazamientos a ojo. Es el control más rápido de que extracción, validación y visor coinciden.
