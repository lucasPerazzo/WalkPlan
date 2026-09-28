# Prompt 1 — Visor 3D (Claude Code, en la raíz del repo)

```text
Vamos a construir el visor 3D del proyecto (contexto en CLAUDE.md). La especificación
está en los skills r3f-arch-viz y house-schema; para la UI usá frontend-design.

Setup (antes de la fase 1):
- Estructura del repo según CLAUDE.md y .gitignore con data/, cualquier house.json
  real, node_modules y builds.
- viewer/ con Vite + React + TypeScript.
- Copiá house-schema/assets/house.example.json a viewer/public/ como house.json y
  house.example.json. Usamos el ejemplo hasta tener el real.

Requisitos no negociables:
1. El recorrido es en PRIMERA PERSONA y es el modo principal: la app arranca ahí y se
   puede caminar por dentro y por fuera de la casa.
2. Muebles 3D reales (no cajas) para todas las claves del catálogo, colocados desde
   el JSON, con editor en planta y exportación del JSON.
3. Entorno exterior seleccionable en runtime: bosque, ciudad, barrio, campo, playa.
4. Vista Actual vs Reforma.

Trabajá por las 6 fases del skill r3f-arch-viz. En cada fase:
- Antes de escribir código, mostrame un plan corto (archivos a crear o modificar,
  decisiones y dependencias nuevas) y esperá mi OK.
- Al cerrar: tests en verde, capturas según references/visual-testing.md, lista de
  archivos modificados, ZIP del proyecto y "Estado actual" actualizado en CLAUDE.md.
  Después pará y esperá mi revisión.

Empezá por el setup y el plan de la fase 1.
```

Para continuar después de revisar cada fase:

```text
Fase N aprobada. Seguí con el plan de la fase N+1.
```
