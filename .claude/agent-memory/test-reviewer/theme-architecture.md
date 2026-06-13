---
name: theme-architecture
description: How theme toggling works in music-tagger — CSS custom properties, dark class, localStorage
metadata:
  type: reference
---

# Theme Architecture in music-tagger

Theme is toggled by adding/removing the `dark` class on `<html>` (`document.documentElement`).

**CSS**: `index.css` defines CSS custom properties (`--s-*` for surfaces, `--tx-*` for text) in two blocks: `:root` (light = default) and `.dark` (dark mode). Tailwind's `dark:` variants use the `.dark` class on `<html>` via `darkMode: 'class'` in the Tailwind config.

**localStorage**: key `'theme'`, values `'dark'` | `'light'`. Dark mode is the default fallback.

**Initialization**: `index.html` has a blocking `<script>` that reads localStorage and sets `.dark` class before any paint, preventing flash.

**Runtime**: `useTheme` hook in `src/hooks/useTheme.ts` manages state reactively. Uses `MutationObserver` on `<html>` class attribute to sync state when external code modifies it, plus `toggleTheme()` for direct user interaction.

**Note**: The MutationObserver in useTheme and the manual `setDark` call in toggleTheme both fire setState — intentional for robustness, not a bug (React bailout prevents double render).
