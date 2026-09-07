export const THEME_KEY = 'theme';

export function initialTheme(storage = localStorage, prefersDark = null) {
  let saved = null;
  try { saved = storage.getItem(THEME_KEY); } catch {}
  if (saved === 'light' || saved === 'dark') return saved;
  if (prefersDark === null) {
    try { prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return 'light'; }
  }
  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(current) {
  return current === 'dark' ? 'light' : 'dark';
}

export const cycleTheme = nextTheme;

export const THEME_COLORS = { light: '#ffe29a', dark: '#2b2118' };

export function toggleTheme(doc = document) {
  const cur = doc.documentElement.dataset.theme || initialTheme();
  const nx = nextTheme(cur);
  applyTheme(nx, doc);
  doc.querySelectorAll('[data-theme-toggle]').forEach((b) => {
    b.textContent = nx === 'dark' ? '☀️' : '🌙';
    b.setAttribute('aria-label', nx === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  });
  return nx;
}

export function applyTheme(theme, doc = document) {
  doc.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
  const metas = doc.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m) => { m.removeAttribute('media'); m.setAttribute('content', THEME_COLORS[theme]); });
}

export function bindThemeToggle(button, doc = document) {
  button.addEventListener('click', () => {
    const cur = doc.documentElement.dataset.theme || initialTheme();
    const nx = nextTheme(cur);
    applyTheme(nx, doc);
    button.textContent = nx === 'dark' ? '☀️' : '🌙';
    button.setAttribute('aria-label', nx === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  });
  button.textContent = (doc.documentElement.dataset.theme || 'light') === 'dark' ? '☀️' : '🌙';
  button.setAttribute('aria-label', (doc.documentElement.dataset.theme || 'light') === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}
