# vassal-ocs

> Fork personal del emulador TypeScript de VASSAL para jugar módulos **OCS** (Operational Combat Series) offline desde el iPad, sin Java ni servidor dedicado.

[![Deploy to Pages](https://github.com/JaviARQ/vassal-ocs/actions/workflows/deploy.yml/badge.svg)](https://github.com/JaviARQ/vassal-ocs/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Site](https://img.shields.io/badge/site-javiarq.github.io-blue)](https://javiarq.github.io/vassal-ocs/)

---

## Origen y atribución

Este proyecto es una **bifurcación (fork) del emulador [vassal-ts-emulator](https://github.com/TyroneSlothrop/vassal-ts-emulator)** desarrollado por **TyroneSlothrop** y publicado bajo licencia [MIT](./LICENSE).

Todo el crédito por la implementación del intérprete TypeScript del formato `.vmod`, los parsers de `buildFile.xml`, los traits y la renderización en canvas HTML es del autor original. Este fork únicamente añade:

- Un **parche para compatibilidad con Windows** en el script `scripts/gen-presets.mjs`.
- **Módulos OCS** descargados desde la [biblioteca oficial de VASSAL](https://vassalengine.org/library).
- Un **service worker** para uso offline en iPadOS Safari.
- Un **workflow de GitHub Actions** para deploy automático a GitHub Pages.
- Un `.gitignore` (no existía en el upstream).

Para consultar el código original, el historial completo y la documentación técnica del emulador, visita el repositorio **upstream**:
**https://github.com/TyroneSlothrop/vassal-ts-emulator**

---

## Estado actual

### Módulos cargados

| Módulo | Versión | Tamaño | Estado |
|---|---|---|---|
| **OCS - Tunisia II** | 1.17.2 | ~39 MB | ✅ Carga y se juega correctamente |

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
- **Offline**: `public/sw.js` cachea HTML, JS, CSS y `.vmod` para que el sitio funcione sin conexión en el iPad.

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
npm run presets   # genera public/modules/presets.json
npm run dev       # http://localhost:5173
```

Para producción local:

```bash
npm run build     # genera dist/
npm run preview   # sirve el build localmente
```

> ⚠️ **Windows**: tras `npm install` puede aparecer un aviso sobre `esbuild postinstall not yet covered by allowScripts`. Es informativo. Si el dev server falla, ejecuta `npm install-scripts approve esbuild` y `npm rebuild esbuild`.

---

## Añadir módulos nuevos

1. **Descargar** el `.vmod` desde https://vassalengine.org/library.
2. **Colocarlo** en `public/modules/<nombre-corto>/`.
3. **Probar en local**:
   ```bash
   npm run presets
   npm run dev
   ```
   Cargar el módulo en `http://localhost:5173` y verificar que funciona.
4. **Subir si va bien**:
   ```bash
   git add .
   git commit -m "feat: añadir <nombre del módulo> <versión>"
   git push
   ```
5. GitHub Actions reconstruye y publica automáticamente (~1-2 min).

### Aviso sobre clases Java personalizadas

El emulador interpreta el formato `.vmod` pero **no ejecuta clases Java personalizadas**. Módulos OCS modernos (como Tunisia II desde v1.0) están limpios de Java y funcionan bien. Módulos antiguos pueden tener Java dependiente que no funcionará. **Siempre probar en local antes de pushear.**

---

## Sincronizar con el upstream

Para absorber mejoras del autor original:

```bash
git fetch upstream
git merge upstream/main
# resolver conflictos si los hay (probable en scripts/gen-presets.mjs)
git push
```

El remote `upstream` apunta a `https://github.com/TyroneSlothrop/vassal-ts-emulator.git`.

Si solo quieres ver qué commits nuevos hay sin fusionar:

```bash
git log HEAD..upstream/main --oneline
```

---

## Modificaciones realizadas sobre el original

| Archivo | Cambio | Razón |
|---|---|---|
| `scripts/gen-presets.mjs` | `fileURLToPath(new URL(...))` en vez de `.pathname` | Bug en Windows: `.pathname` devuelve `/C:/...` que se interpreta como `C:\C:\...` |
| `.gitignore` | Creado (no existía en upstream) | Excluir `node_modules/`, `dist/`, logs, archivos de editor, etc. |
| `.github/workflows/deploy.yml` | Creado | Workflow CI para deploy automático a Pages |
| `public/sw.js` | Creado | Service worker con estrategias network-first + stale-while-revalidate |
| `public/sw-register.js` | Creado | Registro del SW desde `index.html` |
| `index.html` | Añadida etiqueta `<script>` de registro del SW | Activar offline |
| `public/modules/tunisia-ii/Tunisia_II_1_17_2.vmod` | Añadido | Módulo OCS Tunisia II 1.17.2 |
| `public/modules/presets.json` | Generado | Índice de módulos disponibles |

El parche Windows (`gen-presets.mjs`) es un bug fix real que afecta a cualquier usuario Windows, no algo específico de este fork. Está planificado para **subir como Pull Request al upstream**; cuando se acepte, este fork dejará de necesitar el parche local.

---

## Licencia

Este proyecto mantiene la **licencia MIT** del repositorio original. Ver [LICENSE](./LICENSE) para el texto completo.

Los módulos VASSAL cargados en `public/modules/` son propiedad de sus respectivos editores y se distribuyen públicamente desde la [biblioteca oficial de VASSAL](https://vassalengine.org/library) con permiso de los editores:

- **Serie OCS**: © Multi-Man Publishing (MMP)
- **VASSAL engine**: © Vassal project

---

## Agradecimientos

- **[TyroneSlothrop](https://github.com/TyroneSlothrop)** — autor del emulador TypeScript original.
- **[VASSAL team](https://vassalengine.org)** — por el engine y la biblioteca de módulos.
- **[Multi-Man Publishing](https://mmpgamers.com)** — por la serie OCS.
- Comunidad OCS en [BoardGameGeek](https://boardgamegeek.com) — por el mantenimiento continuo de los módulos.
- Jeff Coyle, Herman Wu, Myk Deans — mantenedores del módulo Tunisia II.

---

*Este fork es personal y está optimizado para jugar OCS offline desde iPad. No afiliado ni respaldado por el equipo VASSAL ni por MMP.*
