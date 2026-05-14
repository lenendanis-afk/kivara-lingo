# Kivara Lingo

> Aprende idiomas mientras ves tu serie favorita. Subtítulos personalizables, tarjetas de Anki en un clic, sin salir del reproductor.

**Kivara Lingo** es una extensión de navegador que se monta sobre cualquier plataforma de streaming (Netflix, HBO Max, Disney+, YouTube, Prime Video) y convierte sus subtítulos en una herramienta de aprendizaje de vocabulario. Al pasar el ratón sobre una palabra o expresión obtienes su significado, fonética y traducción; con un clic generas una tarjeta de Anki que incluye la frase completa, el audio y un fotograma del momento exacto.

Este repositorio contiene el **prototipo de UI/UX en React + Tailwind v4** que simula el comportamiento de la extensión dentro de un navegador maquetado. Es la referencia visual y funcional para la implementación real como WebExtension.

---

## ¿Qué resuelve?

Aprender un idioma viendo series funciona, pero el flujo está roto:

- Pausas el video, copias la frase, abres el diccionario, abres Anki, creas una tarjeta, vuelves al video, pierdes el ritmo.
- Las extensiones existentes (Language Reactor, Migaku) son potentes pero pesadas, con UI que invade la experiencia de ver una serie.

Kivara Lingo apuesta por **mínima fricción**: hover → entender, clic → guardar, scroll → separar expresiones. Todo sin sacar el ratón del subtítulo.

---

## Características principales

- **Subtítulos personalizables**: tamaño, color, peso, sombra, fondo, opacidad y posición (arriba / medio / abajo) con ajuste fino de altura.
- **Tokenización inteligente**: detecta expresiones multi-palabra (MWE: *these days*, *kick the bucket*) y las trata como una sola unidad.
- **Hover-to-learn**: al pasar el ratón sobre una palabra o MWE aparece un popover con fonética, traducción bilingüe y monolingüe, audio TTS y botón de guardado.
- **Scroll para separar / unir**: scroll abajo sobre una MWE la divide en palabras; scroll arriba sobre una palabra la vuelve a unir.
- **Modo Lectura**: oculta toda la UI de aprendizaje y deja solo subtítulos estilizados. Para cuando quieres simplemente ver.
- **Generación de tarjetas Anki en un clic**: vía AnkiConnect, con mapeo configurable de campos (palabra, frase, traducción, fonética, audio, screenshot).
- **Captura automática**: audio de la pestaña + screenshot del frame en el momento exacto del cue de subtítulo.
- **Modo Auto / Manual**: el modo automático (recomendado) usa VAD y centro del cue; el manual permite ajustar buffer, fuente de audio, momento del frame, etc.
- **Atajos de teclado**: `Ctrl+S` guardar, `Alt+C` toggle subtítulos, `Alt+R` repetir frase, `Alt+V` re-capturar frame.
- **Tema claro y oscuro**, panel acoplado o flotante.

---

## Estructura del prototipo

```
src/
├── app/
│   ├── App.tsx                      # Layout principal (navbar mock + video + panel)
│   ├── types.ts                     # SubtitleStyles, AnkiMapping, FieldSource
│   └── components/
│       ├── VideoPlayer.tsx          # Reproductor mock + subtítulos interactivos + popover
│       ├── ExtensionPanel.tsx       # Panel lateral con tabs (acoplado/flotante)
│       ├── KivaraLingoLogo.tsx      # Logo del producto
│       ├── tabs/
│       │   ├── SubtitlesTab.tsx     # Personalización de estilo de subtítulos
│       │   ├── CardsTab.tsx         # Mapeo de campos Anki + conexión AnkiConnect
│       │   └── SettingsTab.tsx      # Modo captura, limpieza visual, atajos
│       └── figma/
│           └── ImageWithFallback.tsx
└── styles/
    ├── theme.css                    # Tokens, dark mode, .sl-input/.sl-select/.sl-range
    └── fonts.css
```

---

## Stack

- **React 18** + TypeScript
- **Tailwind CSS v4** (con `@theme inline` y class-based dark mode)
- **lucide-react** para iconografía
- **sonner** para notificaciones (toast)
- **Vite** (entorno Figma Make — el dev server ya corre solo)

---

## Cómo correr el prototipo

El entorno de Figma Make ya tiene el dev server activo. Solo abre la app desde la superficie de preview. **No** ejecutes `npm run dev` ni `vite build` — fallarán.

Para desarrollo local fuera de Figma Make:

```bash
pnpm install
pnpm dev
```

---

## Implementación real

Este prototipo es la **referencia funcional** para construir la extensión real (Manifest V3, Chromium / Firefox).

Lee `IMPLEMENTATION.md` para la especificación técnica completa: arquitectura, APIs del navegador, librerías recomendadas, mapeo de cada interacción del prototipo a su contraparte real, y el plan de implementación paso a paso.

---

## Marca

**Kivara Lingo** es el primer producto de **Kivara**, una marca personal que albergará otras herramientas en el futuro (Kivara Notes, Kivara Read, etc.). El logo del producto combina la marca paraguas (*Kivara*) con el sub-nombre (*Lingo*) en color de acento.

---

## Licencia

Por definir.
