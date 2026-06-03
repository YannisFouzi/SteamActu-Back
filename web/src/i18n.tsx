import { createContext, useContext } from 'react';
import fr from './locales/fr.json';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';

// Reuses the mobile app's translations (frontend/src/i18n/locales, regenerated
// into ./locales) so the web feed UI is localized exactly like the mobile app.
const LOCALES: Record<string, unknown> = { fr, en, de, es, ru, zh };

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

function lookup(obj: unknown, key: string): string | undefined {
  let node: unknown = obj;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object') {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{{${k}}}`,
  );
}

// Builds a translator bound to `lang`, falling back to French (then the key)
// for any missing entry.
export function makeT(lang: string): TFunc {
  const primary = LOCALES[lang] ?? LOCALES.fr;
  return (key, vars) => {
    const s = lookup(primary, key) ?? lookup(LOCALES.fr, key) ?? key;
    return interpolate(s, vars);
  };
}

interface LangCtx {
  lang: string;
  setLang: (l: string) => void;
  t: TFunc;
}

export const LangContext = createContext<LangCtx>({
  lang: 'fr',
  setLang: () => undefined,
  t: makeT('fr'),
});

export function useT(): LangCtx {
  return useContext(LangContext);
}
