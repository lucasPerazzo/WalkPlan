---
name: r3f-arch-viz
description: Reglas de implementación del visor 3D de la casa (React Three Fiber + drei + rapier) que consume house.json — construcción de paredes con aberturas, pisos, materiales PBR, recorrido en primera persona, muebles 3D, entornos exteriores seleccionables (bosque, ciudad, barrio, campo, playa), toggle actual/reforma, performance y verificación visual. Usar siempre que se escriba, modifique, depure o revise código del visor, de su geometría, de sus materiales o de su navegación, o cuando se trabaje con modelos de muebles, HDRIs o entornos, o cuando algo "se ve mal" en la escena (paredes rotadas, huecos en esquinas, texturas estiradas, parpadeo), aunque el usuario no nombre este skill.
---

# r3f-arch-viz

Visor web de la casa. Datos: `house.json` según `house-schema` (leerlo antes de tocar el loader o la geometría). Verificación visual: `references/visual-testing.md` junto con el skill `webapp-testing`.

## Forma de trabajo

- Trabajar **por fases**. Al terminar cada una, parar y esperar la revisión del usuario antes de seguir.
- Cambios mínimos y justificados: no refactorizar lo que no hace falta para la tarea.
- En cada iteración, entregar los **archivos modificados** más un **ZIP** del proyecto.
- Fases:
  1. Carga del JSON, paredes con huecos de aberturas, pisos en gris, vistas maqueta (Orbit) y planta (ortográfica cenital).
  2. **Primera persona** completa (modo principal): spawn, colisiones, carpinterías, puertas, mobile.
  3. Materiales PBR, iluminación, sol orientado con `site.north_deg` y slider de hora.
  4. Muebles: catálogo, carga de glTF, colocación desde `furniture`, colliders, editor simple en planta.
  5. Entornos exteriores seleccionables en runtime, terreno, calle y props procedurales.
  6. Toggle Actual/Reforma, resaltado de cambios, medición, panel de incertidumbres, pulido y performance.
- Toda fase termina con capturas de verificación (ver `references/visual-testing.md`). Compila ≠ se ve bien.

## Stack y estructura

Vite + React + TypeScript, `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`. Sin backend. Consultar la documentación actual de estas librerías (por ejemplo vía Context7) antes de usar una API que no esté en el código existente: cambian entre versiones.

```
src/model/     tipos (copiados de house-schema/references/schema.ts) + carga y drag&drop
src/geometry/     funciones puras, sin React, con tests en vitest
src/scene/        componentes R3F
src/furniture/    catálogo, carga de modelos, editor
src/environment/  presets de entorno y generadores procedurales
src/ui/           controles
public/           house.json, house.example.json, textures/, models/, hdri/
```

La geometría vive en funciones puras porque es donde están los bugs difíciles (ángulos, offsets, esquinas) y se testean sin levantar un canvas.

## Geometría

**Mapeo:** plano `(x, y)` → Three `(x, h, -y)`.

**Rotación de pared:** con `dx, dy` en coordenadas del **plano**, `mesh.rotation.y = Math.atan2(dy, dx)`. Así el eje local +x de la box apunta de start a end. Es el bug más común: usar el delta en Z de Three sin invertir el signo.

**Caras de la box:** `BoxGeometry` tiene grupos de material en orden `+x, -x, +y, -y, +z, -z` (índices 0–5). Con la rotación anterior:
- local +z (grupo 4) = lado **derecho** de start→end en el plano;
- local -z (grupo 5) = lado **izquierdo**.

**Cara exterior:** para muros exteriores, tomar el punto medio de la pared desplazado 0.3 m hacia la normal derecha `(dy, -dx)/L` y chequear si cae dentro del contorno de la casa (point-in-polygon sobre la unión de rooms o el loop exterior). Si cae afuera, la derecha es la fachada.

**Aberturas:** partir la pared en segmentos en coordenadas locales `(u, v)` (u sobre el eje desde start, v en altura): tramos llenos entre vanos, antepecho `[0, sill]` y dintel `[sill + height, wallHeight]` en cada vano. Nada de CSG. Un segmento se ubica en `start + dir * (u0 + u1)/2`, altura `(v0 + v1)/2`.

**Esquinas:**
- En nodos en L (dos paredes no colineales), extender **solo una** de las dos (la de id menor) `maxThickness/2`. Si se extienden ambas, sus caras quedan coplanares en la esquina y aparece z-fighting.
- En nodos colineales (pared partida) no extender.
- En T, el tallo termina en el eje de la pasante (queda oculto).

**Pisos:** `new THREE.Shape(points del plano)` → `ShapeGeometry` → `rotation.x = -Math.PI / 2`. Esto lleva `(x, y)` a `(x, 0, -y)` con la normal hacia arriba, sin trucos. Elevar 1 mm para evitar z-fighting con un suelo exterior.

**UV en metros:** escalar las UV de cada cara por sus dimensiones reales (u × largo o espesor, v × alto) para que 1 unidad de UV = 1 m. Así una textura de 1 m de ladrillo repite a escala real en cualquier pared, sin tocar `texture.repeat` por mesh.

**Techo:** losa de 0.20 m sobre el contorno exterior (caras de los ejes exteriores desplazadas medio espesor), con toggle en maqueta; desde adentro es el cielorraso. Con `hip` y contorno ortogonal, encima va el techo a cuatro aguas (`geometry/hipRoof.ts`): pendiente 25°, alero 0.40 m, unión de los cuatro aguas de todos los rectángulos máximos del contorno (para polígonos ortogonales es exactamente el techo del esqueleto recto); material de dos caras para ver el alero desde abajo. Si el contorno no es ortogonal queda la losa. `gable` y `shed` siguen como losa plana (TODO).

## Materiales e iluminación

- Texturas PBR CC0 (ambientCG) en `public/textures/<material>/{color,normal,roughness}.jpg`; si faltan, color plano.
- Mapa de color con `colorSpace = SRGBColorSpace`; normal y roughness lineales. `wrapS/T = RepeatWrapping`, anisotropy según `gl.capabilities`.
- Color del schema: sin textura se usa directo. Con textura, como **tinte suave** (lerp desde blanco, factor configurable, default 0.35), porque multiplicar una textura de ladrillo por un color ladrillo la oscurece.
- Crear cada material **una vez** por `MaterialRef` (cache por clave `material+color`), no por mesh.
- Iluminación: `Environment` de drei (HDRI local en `public/hdri/`, uno por preset de entorno) + `directionalLight` como sol con sombras (shadow map 2048, frustum ajustado al bounding box de la casa), cielo procedural (`Sky`) que sigue al sol y una hemisférica cálida como rebote. Slider de hora solar y selector de estación; la latitud sale de `site.latitude` (sin ella, −35° con aviso) y el norte de `site.north_deg`.
- Texturas (también las de terreno y calle) y HDRI se descargan con `viewer/scripts/fetch_assets.py` (no se commitean). Cada textura define cuántos metros cubre una repetición (`TILE_METERS` en `materials.ts`). Las capas casi coplanares (suelo, calle, marcas) se separan con `polygonOffset`, no con milímetros de altura.

## Primera persona (modo principal)

El recorrido en primera persona es el objetivo del proyecto; las demás vistas son auxiliares.

- La app arranca en primera persona, con un overlay "click para entrar" (pointer lock). El spawn está afuera, a 3 m frente a la puerta exterior principal (la `door` en muro exterior más ancha visible en la vista actual; a igual ancho, la primera), mirando hacia la casa. El lado exterior se decide contando cruces con los ejes de los muros exteriores.
- Controles: WASD, shift para correr, mouse para mirar, E para abrir y cerrar la puerta más cercana (animada), Esc para liberar el mouse, 1/2/3 para primera persona, maqueta y planta. En mobile, joystick virtual a la izquierda y arrastre para mirar a la derecha.
- Puertas: el schema no guarda el lado de apertura. Bisagra en la jamba de `start` (dos hojas si el ancho supera 1.20 m), y la hoja abre hacia el lado opuesto a la persona (siempre empuja). Arrancan abiertas las interiores y cerradas las exteriores. Corredizas: una hoja que entra en la pared, o dos si superan 1.60 m.
- Cuerpo: cápsula de rapier con rotaciones bloqueadas (o KinematicCharacterController), ojos a 1.60 m del piso, velocidad de caminata 1.4 m/s y 3 m/s corriendo.
- Colisiones: paredes (un cuboide por segmento, los vanos quedan libres), vidrios de ventanas (hay paños con antepecho 0), muebles (cuboide por huella, salvo `rug`), puertas cerradas, troncos y edificios del entorno cercanos, más un límite invisible del área caminable.
- Los muebles tienen un collider cuboide con las medidas nominales del catálogo (la huella × alto), sea cual sea el modelo.
- Se puede salir al terreno y recorrer el exterior.
- Vistas auxiliares: maqueta (OrbitControls al centro del bounding box) y planta (cámara ortográfica cenital), con tecla o botón para volver a primera persona en el mismo punto.

## Muebles

- El catálogo del visor (`src/furniture/catalog.ts`) implementa **todas** las claves de `house-schema/references/furniture-catalog.md`. Cada entrada define medidas nominales y el origen del modelo: un `.glb` del Kenney Furniture Kit 2.0 (CC0, fuente y licencia en `SOURCES`) o un modelo armado en código (`procedural.ts`: `bidet`, `bbq`, `lounger`, que el kit no tiene).
- `viewer/scripts/fetch_assets.py` baja el kit y deja los 140 `.glb` en `public/models/kenney/` con `License.txt` y `public/models/CREDITS.md` (no se commitean).
- Paleta (`palette.ts`): los modelos de Kenney traen colores de juguete con nombres de material fijos (`carpet`, `wood`, `metal`…); se reemplazan por una paleta realista tomada del Idea Book. Por clave se pueden reasignar nombres (`materials` en el catálogo: loza en baños, `metal` → piedra en las mesadas de cocina, madera oscura en exterior).
- Normalizar cada modelo al cargarlo (`normalizeMatrix`): girar `yaw` para que el frente quede en +Z, escalar a las medidas nominales del catálogo (no a las del archivo) y dejar el origen en el centro de la huella a nivel del piso. Con eso, `position` y `rotation` del JSON se aplican directo (`rotation.y = deg * π/180`). Con el kit actual todos los `yaw` son 0 (verificado con la lámina de catálogo).
- Se hornean las transformaciones del archivo y se fusiona una geometría por material; cada clave se dibuja con una `InstancedMesh` por material (un draw call por material aunque haya 7 módulos de cocina). Después de mover instancias, `computeBoundingSphere()` para que el recorte por frustum no las pierda.
- Si falta un modelo, dibujar una caja con las medidas nominales y la clave como etiqueta. Nunca omitir un mueble.
- Color opcional del item: sin textura, se aplica directo a las telas (materiales `fabric` de la paleta) como color de instancia.
- **Editor en planta:** en la vista planta se dibujan las huellas de todos los muebles (también las alacenas, que quedan sobre el corte). Clic o toque para seleccionar, arrastrar para mover, manija delante del frente para rotar de a 15° (shift = libre), Q/E ±15° (shift ±1°), Supr para borrar, Esc para soltar; panel para agregar desde el catálogo (aparece en el centro de la vista). Mientras se arrastra, MapControls queda deshabilitado. Lo tocado pasa a `source: "user"`, el `room` se recalcula por punto en polígono y los nuevos llevan el próximo `f<n>` y `status: "new"`. Botón "Exportar JSON" que descarga el house.json con `furniture` actualizado y el resto intacto; avisa al cerrar con cambios sin exportar. El editor nunca modifica la geometría de la casa: los muebles son estado aparte y editarlos no reconstruye paredes. Los colliders de muebles se montan al entrar a primera persona.

## Entornos exteriores

- Presets como datos en `src/environment/presets.ts`: `forest`, `city`, `suburb`, `countryside`, `beach`. Cada preset define HDRI (Poly Haven CC0), textura del terreno (ambientCG CC0), niebla, si lleva calle, semilla y el radio caminable.
- **Cielo:** el visible es siempre el procedural (`Sky`) que sigue al sol; el HDRI del preset solo ilumina y refleja (un HDRI de fondo trae su sol fijo en la foto y contradice las sombras al mover la hora). No se usa la proyección del HDRI al suelo.
- El preset inicial sale de `site.environment`; un selector en el panel de abajo lo cambia en runtime sin recargar la casa (`?env=` en modo test).
- Generadores procedurales (`src/environment/generate.ts`, funciones puras con tests) con **seed fija**, para que el entorno no cambie entre recargas. Nunca colocan nada dentro de la zona prohibida (`keepout.ts`): `lot` si existe; si no, el contorno de la casa (vistas actual y reforma) más todos los ambientes (galerías, pérgolas y porches quedan fuera del contorno), con 3 m de margen. Tampoco sobre la calle.
  - Calle (solo `city` y `suburb`): sobre `street_edge` (la calzada del lado derecho de start→end) o, si falta, frente a la puerta principal, paralela a la fachada y más allá de la zona prohibida. Vereda 2 m + calzada 7 m + vereda 2 m, con línea central.
  - `forest`: pinos y árboles de copa en grilla con jitter, más densos hacia afuera, sotobosque, niebla más cerrada.
  - `city`: filas de edificios de alturas variadas enfrente, a los costados y detrás, faroles y árboles en las veredas.
  - `suburb`: casas vecinas bajas con techo a dos aguas, cercos vivos al frente de cada lote (nunca frente al terreno propio), árboles y arbustos, faroles.
  - `countryside`: pasto, grupos de árboles y árboles sueltos, arbustos, lomas lejanas.
  - `beach`: arena, agua con oleaje (detrás de la casa, del lado opuesto a la entrada), médanos, arbustos y pinos del lado de tierra.
- Props armados en código (`props.ts`, estilo maqueta como los muebles). Todo prop repetido va en `InstancedMesh` (una por tipo y material, con variación de tono por instancia); edificios, casas y cercos se fusionan en dos geometrías con color por vértice y una textura de ventanas por módulo de 3 × 3 m (UV en módulos). Los props cerca de la casa proyectan sombra; los lejanos no.
- Colliders (cuboides) solo dentro del área caminable: troncos, faroles, edificios, casas y cercos. El límite caminable es el bounding box de la zona prohibida más `walkRadius`.
- La niebla arranca más allá de la distancia de la maqueta (la casa no se empaña). En maqueta, el botón "Entorno" oculta árboles, faroles y volúmenes (quedan terreno, calle, lomas y agua) porque pueden tapar la casa.

## Actual / Reforma

- **Actual:** `existing` + `demolish`.
- **Reforma:** `existing` + `new`.
- **Resaltar cambios (Cambios, `mode=diff`):** `new` en verde, `demolish` en rojo semitransparente, ambos visibles a la vez.

El filtro se aplica al modelo antes de generar geometría (una función pura `filterByView`), no ocultando meshes a mano. Selector segmentado Actual / Reforma / Cambios en la barra; las dos geometrías se arman una vez por casa y el entorno se orienta siempre con la Reforma.

Cambios usa la geometría de la Reforma (muros nuevos en una malla verde aparte, marcos de aberturas nuevas en verde, jambas y dintel también para los vanos `opening` nuevos, velo verde sobre el piso de ambientes nuevos) y encima lo que se demuele (`geometry/changes.ts`): los tramos de los muros a demoler tal como están en la vista Actual y, en muros que quedan, un paño en el vano de cada abertura que se cierra, restando lo que ocupa una abertura nueva en la misma pared (cambio de abertura). Así no chocan las aberturas viejas y nuevas del mismo tramo. Las cajas rojas se agrandan 1 cm por lado; en planta, el corte de lo nuevo va en verde y el de lo demolido en rojo. Leyenda con los conteos.

## Medición

- **Planta:** tecla M o botón "Medir". Clic y clic; cada extremo se engancha (10 cm) a esquinas y caras de los tramos que corta el plano de corte, incluidas las esquinas interiores y los encuentros en T (intersecciones entre caras). Shift deja la cota horizontal o vertical; Esc cancela; "Borrar cotas". Donde hay una ventana, el corte no tiene muro y no hay enganche. Lógica pura en `geometry/measure.ts`.
- **Primera persona:** M marca el punto bajo la mira (raycast contra la escena, hasta 60 m) y la segunda M da la distancia 3D; la tercera empieza otra.
- Etiquetas con `Html` de drei; el canvas va con `zIndex: 0` para que queden debajo de los paneles.

## Incertidumbres

`meta.uncertainties` en un panel plegable ("Dudas del plano"), primero las de confianza baja. Las que tienen `element_id` (muro, abertura, ambiente o mueble) llevan a la planta centrada en el elemento, resaltado en naranja, y cambian la vista del proyecto a una donde exista (`modeShowing`: un muro a demoler no está en la Reforma). Con el panel abierto, un "?" sobre cada elemento con duda. Lógica pura en `geometry/uncertainty.ts`.

## Performance y memoria

- `useMemo` para geometrías derivadas del JSON. Fusionar los segmentos de pared por material con `mergeGeometries` (los colliders siguen siendo por segmento).
- Al recargar el JSON (drag & drop), hacer `dispose` de geometrías y materiales viejos.
- Limitar `dpr` a `[1, 2]`. Sombras solo en paredes, muebles, piso y sol; los props lejanos del entorno sin sombras.
- Modo liviano en dispositivos táctiles: `dpr` hasta 1.5, shadow map de 1024 y sin props lejanos (arbustos, y árboles a más de 70 m del radio de la casa).
- Build: un paquete por biblioteca grande (`codeSplitting.groups` con prioridad en `vite.config.ts`: react, three, física —rapier con su wasm, ~2.4 MB— y r3f/drei) para que el navegador los cachee aparte de la app (~90 kB).
- Objetivo: 60 fps en desktop y 30 fps en un celular medio, en primera persona y con el entorno más pesado (`city` o `forest`).
- Nada de `setState` dentro de `useFrame`: usar refs.

## Errores frecuentes

| Síntoma | Causa típica |
|---|---|
| Casa espejada o paredes a 90° | Signo de Y/Z invertido, o `atan2` con el delta de Three en vez del del plano |
| Parpadeo en esquinas | Ambas paredes extendidas en un nodo L |
| Piso invisible desde arriba | Rotación del Shape en +π/2 (normal hacia abajo) |
| Texturas estiradas | UV no escaladas a metros |
| Texturas lavadas | Mapa de color sin `SRGBColorSpace` |
| Se atraviesan paredes | Collider creado con el tamaño antes de partir por aberturas, o escala distinta al mesh |
| Mueble girado 90° o de espaldas | Modelo no normalizado a frente +Z, o rotación aplicada en sentido horario |
| Mueble enorme o diminuto | Escalado por las medidas del archivo en vez de las nominales del catálogo |
| Captura en negro | WebGL headless sin SwiftShader o sin `preserveDrawingBuffer` (ver visual-testing) |
