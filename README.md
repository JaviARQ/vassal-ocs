# vassal-ocs

> Fork personal del emulador TypeScript de VASSAL para jugar módulos **OCS** (Operational Combat Series) y otros wargames offline desde el iPad, sin Java ni servidor dedicado.

[![Deploy to Pages](https://github.com/JaviARQ/vassal-ocs/actions/workflows/deploy.yml/badge.svg)](https://github.com/JaviARQ/vassal-ocs/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Site](https://img.shields.io/badge/site-javiarq.github.io-blue)](https://javiarq.github.io/vassal-ocs/)

---

## Origen y atribución

Este proyecto es una **bifurcación (fork) del emulador [vassal-ts-emulator](https://github.com/TyroneSlothrop/vassal-ts-emulator)** desarrollado por **TyroneSlothrop** y publicado bajo licencia [MIT](./LICENSE).

Todo el crédito por la implementación del intérprete TypeScript del formato `.vmod`, los parsers de `buildFile.xml`, los traits y la renderización en canvas HTML es del autor original. Este fork únicamente añade:

- Un **parche para compatibilidad con Windows** en el script `scripts/gen-presets.mjs` (uso de `fileURLToPath` en vez de `.pathname`).
- Un **parche para iOS Safari** en `src/app.ts` (elimina el filtro `accept` del input de cargar `.vsav`, que hacía que iOS pusiera el archivo en gris al no reconocer la extensión).
- Un **service worker** para uso offline en iPadOS Safari.
- Un **workflow de GitHub Actions** para deploy automático a GitHub Pages.
- Un `.gitignore` (no existía en el upstream).

Para consultar el código original, el historial completo y la documentación técnica del emulador, visita el repositorio **upstream**:
**https://github.com/TyroneSlothrop/vassal-ts-emulator**

---

## Estado actual

### Filosofía de uso

El repo está **limpio**: no incluye módulos empaquetados. El emulador se sirve desde GitHub Pages y los módulos `.vmod` se cargan **al vuelo** desde la app Archivos del iPad mediante el botón "Load module from file" del propio emulador.

### Workflow de juego

1. **Descargar el `.vmod`** desde https://vassalengine.org/library directamente en Safari del iPad (se guarda en app Archivos → Descargas).
2. **Abrir la app VASSAL** desde el icono de pantalla de inicio del iPad.
3. **Botón "Load module from file"** → explorador → Descargas → selecciona el `.vmod`.
4. **Jugar**. Para guardar partida: botón Save → baja el `.vsav` a Descargas.
5. Para cargar partida guardada: botón Load partida → selecciona el `.vsav`.

### Offline

El emulador (HTML/JS/CSS) está cacheado por el service worker; el `.vmod` vive en la app Archivos del iPad. **Cero red necesaria para jugar una vez instalado el SW** (la primera visita debe ser online para que el SW se registre).

### Acceso

- **Web pública**: https://javiarq.github.io/vassal-ocs/
- **Optimizado para**: iPadOS Safari, con cache offline vía service worker.
- **Último deploy**: ver [Actions](https://github.com/JaviARQ/vassal-ocs/actions).

---

## Arquitectura del deploy

```
git push → GitHub Actions → npm ci + npm run presets + npm run build → dist/ → GitHub Pages
```

- **Hosting**: GitHub Pages (estático, gratis, HTTPS automático).
- **CI**: `.github/workflows/deploy.yml` construye y publica automáticamente en cada push a `main`.
- **Offline**: `public/sw.js` cachea HTML, JS y CSS. Los `.vmod` se cargan desde la app Archivos del iPad (no necesitan caching por SW).

---

## Setup local

### Requisitos

- Node.js 18+ LTS — https://nodejs.org
- Git — https://git-scm.com
- Windows / macOS / Linux

### Pasos

```bash
git clone https://github.com/JaviARQ/vassal-ocs.git
cd vassal-ocs
npm install
npm run dev       # http://localhost:5173
```

Para producción local:

```bash
npm run build     # genera dist/
npm run preview   # sirve el build localmente
```

> ⚠️ **Windows**: tras `npm install` puede aparecer un aviso sobre `esbuild postinstall not yet covered by allowScripts`. Es informativo. Si el dev server falla, ejecuta `npm install-scripts approve esbuild` y `npm rebuild esbuild`.

---

## Cargar módulos

### Opción A — Desde archivo local (recomendada para iPad)

1. Descargar el `.vmod` desde https://vassalengine.org/library en Safari del iPad.
2. Abre la app VASSAL desde el icono.
3. Botón **Load module from file** → selecciona el `.vmod` desde Archivos → Descargas.

**Ventajas**: no añade peso al repo, no requiere deploy, puedes cargar cualquier módulo OCS (o de cualquier otra serie) sin tocar el repo.

**Inconveniente**: tienes que cargar el `.vmod` cada vez que abres la app. Si quieres que un módulo quede siempre disponible en el selector, usa la Opción B.

### Opción B — Como preset empaquetado (si quieres tener módulos fijos)

Si prefieres tener uno o varios módulos siempre pre-cargados en el selector del emulador:

1. Descarga el `.vmod` a tu PC.
2. Colocalo en `public/modules/<nombre-corto>/`.
3. Ejecuta:
   ```bash
   npm run presets      # actualiza public/modules/presets.json
   npm run dev          # prueba en local en http://localhost:5173
   ```
4. Si carga bien, súbelo:
   ```bash
   git add .
   git commit -m "feat: añadir <nombre del módulo> <versión>"
   git push
   ```
5. GitHub Actions reconstruye y publica automáticamente (~1-2 min).

> ⚠️ **Aviso sobre clases Java personalizadas**: el emulador interpreta el formato `.vmod` pero **no ejecuta clases Java personalizadas**. Módulos OCS modernos (Tunisia II desde v1.0, etc.) están limpios de Java y funcionan bien. Módulos antiguos pueden tener Java dependiente que no funcionará. **Siempre probar en local antes de pushear.**

---

## Guardar y cargar partidas (.vsav)

- **Guardar**: botón Save del emulador → baja un archivo `.vsav` a Descargas (es un ZIP con el estado de la partida, compatible con VASSAL Java de escritorio).
- **Cargar**: botón Load partida → selecciona el `.vsav` desde Archivos.

> ℹ️ **Nota sobre iOS Safari**: en el emulador original, el selector de archivos para cargar `.vsav` tenía un filtro `accept=".vsav,..."` que hacía que iOS pusiera el archivo en gris al no reconocer la extensión. **Este fork elimina ese filtro**, por lo que los `.vsav` se pueden seleccionar directamente sin renombrar a `.zip`.

---

## Sincronizar con el upstream

Para absorber mejoras del autor original:

```bash
git fetch upstream
git merge upstream/main
# resolver conflictos si los hay (probable en scripts/gen-presets.mjs y src/app.ts)
git push
```

El remote `upstream` apunta a `https://github.com/TyroneSlothrop/vassal-ts-emulator.git`.

Si solo quieres ver qué commits nuevos hay sin fusionar:

```bash
git log HEAD..upstream/main --oneline
```

> ⚠️ **Conflictos previsibles al sincronizar**: este fork modifica dos archivos del upstream:
> - `scripts/gen-presets.mjs` (parche Windows `fileURLToPath`)
> - `src/app.ts` (parche iOS Safari para `.vsav`)
>
> Si el autor original cambia alguno de estos archivos, habrá conflicto al mergear. Ver la guía de mantenimiento en `docs/Guia_Mantenimiento_VASSAL_OCS.pdf` para el procedimiento de resolución.

---

## Modificaciones realizadas sobre el original

| Archivo | Cambio | Razón |
|---|---|---|
| `scripts/gen-presets.mjs` | `fileURLToPath(new URL(...))` en vez de `.pathname` | Bug en Windows: `.pathname` devuelve `/C:/...` que se interpreta como `C:\C:\...` |
| `src/app.ts` | Comentar la línea `input.accept = ".vsav,..."` en `pickAndLoadGame()` | Bug en iOS Safari: el filtro `accept` con extensión `.vsav` hace que iOS ponga el archivo en gris al no reconocer la extensión |
| `.gitignore` | Creado (no existía en upstream) | Excluir `node_modules/`, `dist/`, logs, archivos de editor, etc. |
| `.github/workflows/deploy.yml` | Creado | Workflow CI para deploy automático a Pages |
| `public/sw.js` | Creado | Service worker con estrategias network-first + stale-while-revalidate |
| `public/sw-register.js` | Creado | Registro del SW desde `index.html` |
| `index.html` | Añadida etiqueta `<script>` de registro del SW | Activar offline |

Ambos parches (`gen-presets.mjs` y `src/app.ts`) son **bug fixes reales** que afectan a usuarios Windows e iOS del emulador original, no algo específico de este fork. Están planificados para **subir como Pull Request al upstream**; cuando se acepten, este fork dejará de necesitar los parches locales.

---

## Documentación adicional

En la carpeta `docs/` del repo está la guía de mantenimiento:

- **`Guia_Mantenimiento_VASSAL_OCS.pdf`** — guía completa de mantenimiento: sincronización con upstream, carga de módulos, gestión del SV, troubleshooting, cheat sheet de comandos y glosario.

---

## Licencia

Este proyecto mantiene la **licencia MIT** del repositorio original. Ver [LICENSE](./LICENSE) para el texto completo.

Los módulos VASSAL que se cargan al vuelo desde vassalengine.org son propiedad de sus respectivos editores y se distribuyen públicamente desde la [biblioteca oficial de VASSAL](https://vassalengine.org/library) con permiso de los editores:

- **Serie OCS**: © Multi-Man Publishing (MMP)
- **VASSAL engine**: © Vassal project

---

## Agradecimientos

- **[TyroneSlothrop](https://github.com/TyroneSlothrop)** — autor del emulador TypeScript original.
- **[VASSAL team](https://vassalengine.org)** — por el engine y la biblioteca de módulos.
- **[Multi-Man Publishing](https://mmpgamers.com)** — por la serie OCS.
- Comunidad OCS en [BoardGameGeek](https://boardgamegeek.com) — por el mantenimiento continuo de los módulos.

---

*Este fork es personal y está optimizado para jugar OCS y otros wargames offline desde iPad. No afiliado ni respaldado por el equipo VASSAL ni por MMP.*
