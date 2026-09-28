# Recorrido 3D de la reforma

Visor web para recorrer en primera persona la reforma de una casa: amueblada, con el entorno exterior elegido y con la vista del estado actual y de la reforma. Sirve para entender el anteproyecto antes de aprobarlo: cómo quedan los espacios, qué se demuele y qué se construye.

Todo parte de un único archivo de datos, `house.json`. El visor es genérico y no sabe nada de una casa en particular: cambiar la casa es cambiar datos, no código.

## Pipeline: de los planos al recorrido

```
planos + renders + fotos ──► extracción (IA) ──► house.raw.json
                                                      │
                                    validate_house.py ◄┘  (corrige + reporta)
                                                      │
                                                  house.json ◄── amueblado (IA)
                                                      │
                                                    visor
```

1. **Insumos.** Los planos del anteproyecto (plantas, cortes, fachadas), los renders y las fotos del exterior van en `data/`.
2. **Extracción con IA.** Claude Code lee las láminas con el skill [`plan-extraction`](.claude/skills/plan-extraction) y las pasa a `house.raw.json` según el schema de [`house-schema`](.claude/skills/house-schema). Extrae:
   - las paredes por eje, con espesor y estado (existente, a construir o a demoler) según la leyenda del plano;
   - las puertas y ventanas;
   - los ambientes;
   - las alturas y la orientación al norte;
   - el bloque `style` con materiales y colores: los renders dan lo nuevo y las fotos, lo existente.

   La escala sale de las cotas escritas. Lo que no se puede leer no se inventa: queda en `meta.uncertainties` como pregunta para el arquitecto.
3. **Validación.** `validate_house.py` corrige detalles de geometría (nodos que no coinciden, encuentros en T) y reporta errores y warnings. También puede dibujar el modelo encima del plano (`--preview`) para compararlos a ojo. Se itera hasta tener 0 errores.
4. **Amueblado con IA.** Es un paso aparte que solo reemplaza el bloque `furniture`. Los muebles que se ven en los renders se ubican como ahí aparecen. Los ambientes sin render se amueblan con criterios de ergonomía: circulaciones, barrido de puertas y distancias. Solo se usan claves del catálogo de muebles, y después se vuelve a validar.
5. **Visor.** Carga `house.json` y arma la escena.

Los prompts de cada etapa están en [`prompts/`](prompts). Los scripts que genera la extracción para una casa concreta (`extraction/work/`) no se suben, porque contienen medidas de la casa real.

## Qué hace el visor

- Recorrido en primera persona con colisiones y puertas que se abren, dentro y fuera de la casa. También funciona en el celular.
- Vista de maqueta y de planta.
- Vistas **Actual**, **Reforma** y **Cambios** (lo nuevo en verde, lo demolido en rojo).
- Muebles 3D y un editor en planta que exporta el `house.json`.
- Entornos exteriores: bosque, ciudad, barrio, campo y playa. El sol se orienta según la ubicación.
- Medición con cotas y un panel con las dudas del plano para consultar al arquitecto.

## Estructura

| Carpeta | Contenido |
|---|---|
| `viewer/` | App Vite + React + TypeScript + React Three Fiber (drei, rapier) |
| `validator/` | `validate_house.py`: corrige y valida un `house.json` y genera un reporte |
| `extraction/` | Salidas de la extracción (no se commitean) |
| `.claude/skills/` | Especificación del proyecto: schema (`house-schema`), extracción y reglas del visor |
| `prompts/` | Prompts usados para construir cada etapa |

La especificación del formato está en [`.claude/skills/house-schema`](.claude/skills/house-schema).

## Cómo correrlo

Requisitos: Node LTS y Python 3.11 o superior. Los comandos son para PowerShell.

```powershell
# Texturas PBR, HDRI y modelos de muebles (CC0). Se descargan una sola vez.
python viewer/scripts/fetch_assets.py

# Casa de ejemplo
Copy-Item viewer/public/house.example.json viewer/public/house.json

cd viewer
npm install
npm run dev
```

Otra forma de cargar una casa es arrastrar un `house.json` a la ventana del visor.

## Validador y tests

```powershell
python -m pip install -r validator/requirements.txt
python validator/validate_house.py extraction/house.raw.json --out viewer/public/house.json
python -m pytest validator/tests

cd viewer; npm test
```

Si hay errores, el validador sale con código 1 y no escribe `--out`.

## Privacidad

Los planos, renders, fotos y cualquier `house.json` de la casa real no se suben al repo: están en el `.gitignore`. El repo solo trae `house.example.json`.
