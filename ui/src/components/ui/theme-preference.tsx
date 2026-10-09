import { Fragment, type ReactNode, useEffect, useSyncExternalStore } from "react";
import {
  DARK_ONLY_PALETTES,
  isPalettePreference,
  isThemePreference,
  type LegacyPreferenceKeys,
  legacyMigrations,
  PALETTE_STORAGE_KEY,
  type PalettePreference,
  type PalettePreferenceState,
  THEME_STORAGE_KEY,
  type ThemePreference,
  type ThemePreferenceOptions,
  type ThemePreferenceState,
} from "@/components/ui/theme-preference-base";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Every hook on the page, told when one of them writes. `storage` events only reach other tabs. */
const listeners = new Set<() => void>();

/** A choice storage refused, so a click still sticks for the life of the page. */
const unsaved: { theme: ThemePreference | null; palette: PalettePreference | null } = {
  theme: null,
  palette: null,
};

function stored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage switched off, or a sandboxed frame: there is nothing to read.
    return null;
  }
}

function read(): ThemePreference {
  if (unsaved.theme) {
    return unsaved.theme;
  }
  const value = stored(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : "system";
}

function readPalette(): PalettePreference {
  if (unsaved.palette) {
    return unsaved.palette;
  }
  const value = stored(PALETTE_STORAGE_KEY);
  return isPalettePreference(value) ? value : "default";
}

function prefersDark() {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

/** Both choices at once: a dark-only palette decides the class, whatever the theme says. */
function apply(theme = read(), palette = readPalette()) {
  const darkOnly = DARK_ONLY_PALETTES.includes(palette);
  const html = document.documentElement;
  html.classList.toggle(
    "dark",
    darkOnly || theme === "dark" || (theme === "system" && prefersDark()),
  );
  html.classList.toggle("light", darkOnly === false && theme === "light");
  if (palette === "default") {
    html.removeAttribute("data-palette");
  } else {
    html.setAttribute("data-palette", palette);
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === THEME_STORAGE_KEY ||
      event.key === PALETTE_STORAGE_KEY ||
      event.key === null
    ) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function store(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Not persisted, but still applied: the page should not ignore the click.
    return false;
  }
}

/** Module-level, so every caller's setter is the same function and safe in a dependency list. */
function setPreference(next: ThemePreference) {
  unsaved.theme = store(THEME_STORAGE_KEY, next) ? null : next;
  apply();
  for (const listener of listeners) {
    listener();
  }
}

function setPalette(next: PalettePreference) {
  unsaved.palette = store(PALETTE_STORAGE_KEY, next) ? null : next;
  apply();
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Brings a choice stored under an app's older keys across to cubeui's, once: call it where the
 * app boots, before the first render. The copy is done by the time it returns — it is a promise
 * only so one call site serves the device, where storage is asynchronous.
 *
 * `themePrePaintScript({ legacyKeys })` does the same copy before the first paint; this is for
 * the page that has no such script, and it finds nothing left to do on one that has.
 */
export function migrateThemePreference(
  legacyKeys: LegacyPreferenceKeys,
  _options: ThemePreferenceOptions = {},
): Promise<void> {
  try {
    const storage = window.localStorage;
    for (const { key, from, values } of legacyMigrations(legacyKeys)) {
      if (storage.getItem(key) !== null) {
        continue;
      }
      const old = from.find((name) => values.includes(storage.getItem(name) ?? ""));
      if (old === undefined) {
        continue;
      }
      storage.setItem(key, storage.getItem(old) ?? "");
      storage.removeItem(old);
    }
    apply();
    for (const listener of listeners) {
      listener();
    }
  } catch {
    // No storage, or a server render: there is nothing to bring across.
  }
  return Promise.resolve();
}

/**
 * The stored light / dark / system choice, and a setter that stores and applies it. Call it where
 * the app starts, so the choice is applied — and, on System, kept in step with the device — on
 * every screen, not only the one with the picker on it. It applies the palette as well, so the
 * one call at the root covers both.
 */
export function useThemePreference(_options: ThemePreferenceOptions = {}): ThemePreferenceState {
  const preference = useSyncExternalStore(subscribe, read, () => "system" as const);
  const palette = useSyncExternalStore(subscribe, readPalette, () => "default" as const);

  useEffect(() => {
    // The palette as well: another tab changing it reaches here, and nothing else repaints.
    apply(preference, palette);
    if (preference !== "system" || typeof window.matchMedia !== "function") {
      return;
    }
    // Following the device means repainting when the device changes, without a reload.
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => apply();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference, palette]);

  return [preference, setPreference] as const;
}

/**
 * The stored palette — `default` or one of `PALETTE_PREFERENCES` — and a setter that stores and
 * applies it. `useThemePreference` at the root already applies it; this is for the control that
 * changes it.
 */
export function usePalettePreference(
  _options: ThemePreferenceOptions = {},
): PalettePreferenceState {
  const palette = useSyncExternalStore(subscribe, readPalette, () => "default" as const);
  return [palette, setPalette] as const;
}

/**
 * The device's way in for a palette, which has no `<html>` to key off. On the web the palette is
 * `data-palette` and the stylesheet, so this is its children and nothing more — here so one root
 * compiles on both halves.
 */
export function PaletteProvider({ children }: { children?: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}
