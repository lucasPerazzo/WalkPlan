# Recorrido 3D de la reforma

Visor web para recorrer **en primera persona** la reforma de mi casa, amueblada y en el entorno exterior que elija (bosque, ciudad, barrio, campo, playa), a partir del anteproyecto (planos + renders) y fotos del exterior. El objetivo es entender el proyecto antes de aprobarlo: cómo quedan los espacios, qué se tira, qué se construye y cómo encaja estéticamente con lo existente.

## Pipeline

```
planos + renders + fotos ──► extracción (IA) ──► house.raw.json
                                                      │
                                   validate_house.py ◄┘  (corrige + reporta)
                                                      │
                                   viewer/public/house.json ◄── amueblado (renders → furniture)
                                                      │
                                                  visor R3F  (1ª persona + muebles + entorno)
```

- Todo el proyecto gira en torno a un único contrato: `house.json` (ver skill `house-schema`).
- El visor es genérico: no sabe nada de esta casa. Cambiar la casa es cambiar datos, no código.
- Estética por referencia (camino A): los materiales y colores salen de fotos y renders vía el bloque `style`. No hay fotogrametría por ahora.
- Los muebles son una capa aparte (`furniture`) que se regenera sin tocar la geometría. El entorno exterior se elige en runtime; `site.environment` es solo el default.

## Estructura

```
data/          insumos: planos/, renders/, fotos/   (NO se commitea, ver Privacidad)
extraction/    house.raw.json y salidas de la extracción
validator/     validate_house.py + tests/ (pytest)
viewer/        app Vite + React + TS + R3F
.claude/skills/
```

## Skills: cuándo usar cada uno

| Skill | Usar cuando |
|---|---|
| `house-schema` | Siempre que se lea, escriba, valide o renderice un house.json. Es la fuente de verdad de campos y convenciones. |
| `plan-extraction` | Pasar planos/renders/fotos a JSON, regenerar solo `style`, corregir una extracción. |
| `r3f-arch-viz` | Cualquier código del visor: geometría, primera persona, muebles, entornos, materiales, performance, bugs visuales. |
| `webapp-testing` | Verificar el visor en el navegador con capturas (junto con `r3f-arch-viz/references/visual-testing.md`). |
| `frontend-design` | UI del visor: paneles, controles, toggles, tipografía. |
| `karpathy-guidelines` | Criterio general de código en todo el repo. |

Para APIs de drei, rapier o R3F, consultar la documentación actual (Context7) antes de asumir: cambian entre versiones.

## Convenciones clave (detalle en `house-schema`)

- Metros en todo. Plano `(x, y)` → Three `(x, h, -y)`.
- Paredes por eje; los nodos comparten coordenadas exactas; en encuentros en T la pasante se parte.
- `status`: vista Actual = existing + demolish; vista Reforma = existing + new.
- Muebles: `rotation` en grados antihorario, 0° = frente hacia -y del plano (+Z en Three). Solo claves de `furniture-catalog.md`.
- Si una convención no alcanza, se cambia en `house-schema` y se revisan los cuatro consumidores: extracción, validador, amueblado y visor.

## Forma de trabajo

- Me comunico en español rioplatense; respuestas concisas y directas.
- Cambios mínimos y justificados. Nada de refactors no pedidos.
- Antes de modificaciones grandes o autónomas: proponer el plan y esperar mi OK.
- El visor se hace por fases (ver `r3f-arch-viz`). Al cerrar cada fase: capturas de verificación y parar para revisión.
- Orden del proyecto: visor setup + fase 1 → validador → extracción → amueblado → visor fases 2 a 6 con los datos reales.
- En cada iteración: listar los archivos modificados y generar un ZIP del proyecto.
- Entorno: Windows, Python 3.11+, Node LTS. Usar comandos compatibles con PowerShell.

## Comandos

```powershell
# Extracción (regenera extraction/house.raw.json desde las definiciones medidas sobre el PDF)
python extraction/work/build.py

# Amueblado (reemplaza solo el bloque furniture de viewer/public/house.json; después validar)
python extraction/work/furnish.py

# Validación
python validator/validate_house.py extraction/house.raw.json --out viewer/public/house.json
python validator/validate_house.py extraction/house.raw.json --out viewer/public/house.json --preview data/planos/planta_300.png --preview-out validator/overlay.png
python -m pytest validator/tests   # pytest.exe no está en el PATH
python -m pip install -r validator/requirements.txt

# Visor
cd viewer; npm install; npm run dev
python viewer/scripts/fetch_assets.py   # texturas PBR, HDRI y modelos de muebles (CC0), una vez; no se commitean
cd viewer; npm test

# Capturas de verificación (puerto 5199: el 5173 está ocupado por otra app)
cd viewer; python ../.claude/skills/webapp-testing/scripts/with_server.py --server "npm run dev -- --port 5199 --strictPort" --port 5199 --timeout 60 -- python scripts/shots.py
cd viewer; python scripts/walk_test.py   # colisiones y puertas (server levantado)
cd viewer; python scripts/editor_test.py # editor de muebles + export validado (server levantado)
cd viewer; python scripts/tools_test.py  # Actual/Cambios, medición y dudas del plano (server levantado)

# ZIP de la iteración (sin node_modules, dist ni data/)
powershell -ExecutionPolicy Bypass -File scripts/make-zip.ps1 -Name walkthrough-faseN
```

## Privacidad

Los planos, renders y fotos muestran mi casa real. `data/` y cualquier `house.json` con datos reales van en `.gitignore`. En el repo solo va `house.example.json`. Si se publica el visor (Vercel o GitHub Pages), usar el ejemplo o un deploy privado.

## Estado actual

<!-- Actualizar al cerrar cada fase -->
- [x] Skills creados (schema v2: muebles + sitio; v3 agrega site.latitude)
- [x] Visor setup + fase 1: carga, paredes con huecos, pisos, maqueta y planta (2026-09-23)
- [x] Validador (`validator/`) (2026-09-23; errores → exit 1 sin escribir --out, report.json siempre)
- [x] Extracción con los planos reales (2026-09-23; solo planta baja, 0 errores, 4 warnings aceptados, 11 incertidumbres low para el arquitecto)
- [x] Amueblado (2026-09-23; 93 muebles: 72 del plano, 21 sugeridos; catálogo ampliado a 42 claves; 1 warning justificado)
- [x] Visor fase 2: primera persona, colisiones, carpinterías, puertas, mobile (2026-09-23; muebles como cajas hasta la fase 4)
- [x] Visor fase 3: materiales, luz, sol orientado (2026-09-24; techo como losa plana: el de cuatro aguas queda pendiente)
- [x] Visor fase 4: muebles 3D + editor en planta (2026-09-24; Kenney Furniture Kit CC0 recoloreado, bidet/parrillero/reposera en código)
- [x] Visor fase 5: entornos exteriores seleccionables (2026-09-25; cielo procedural visible, HDRI por preset solo para luz; props en código; sin lot ni street_edge: zona prohibida = casa + ambientes + 3 m, calle frente a la puerta)
- [x] Visor fase 6: actual/reforma, medición, incertidumbres, pulido (2026-09-25; Cambios en verde/rojo, cotas en planta y en primera persona, panel de 31 dudas, techo a cuatro aguas, bundle partido, modo liviano en celular)
- [x] `style` con fotos del exterior (1 foto al atardecer; conviene sumar fotos con luz de día)
