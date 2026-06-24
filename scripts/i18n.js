/* ============================================================
   Локализация и языковая маршрутизация (RU / HE / EN)

   Переводы лежат в /locales/<lang>.json и подгружаются лениво
   (только активный язык). Тексты применяются к элементам с атрибутами:
     data-i18n="key"       → обновляется textContent
     data-i18n-html="key"  → обновляется innerHTML (для <br> и т.п.)

   Язык отражается в маршруте: /ru, /he, /en. Поддерживаются
   переходы «назад/вперёд» и прямой заход по ссылке с языком.
   ============================================================ */

export const SUPPORTED_LANGS = ['ru', 'he', 'en'];
export const DEFAULT_LANG = 'ru';

const RTL_LANGS = new Set(['he']);
const STORAGE_KEY = 'sb_lang';

/* кэш загруженных словарей, чтобы не запрашивать повторно */
const localeCache = new Map();

async function loadLocale(lang) {
  if (localeCache.has(lang)) return localeCache.get(lang);
  const url = new URL(`../locales/${lang}.json`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить локаль «${lang}» (${res.status})`);
  const dict = await res.json();
  localeCache.set(lang, dict);
  return dict;
}

function applyTranslations(dict) {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const value = dict[el.dataset.i18n];
    if (value != null) el.textContent = value;
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const value = dict[el.dataset.i18nHtml];
    if (value != null) el.innerHTML = value;
  });
}

/* ---------- маршрутизация по языку: /ru, /he, /en ---------- */

/* сегменты пути без имени файла (index.html и т.п.) */
function pathSegments() {
  const parts = location.pathname.split('/');
  // отбрасываем имя файла (index.html и т.п.)
  if (parts.length && parts[parts.length - 1].includes('.')) parts.pop();
  // отбрасываем хвостовые пустые сегменты от завершающего слэша (/SB-site/ → /SB-site)
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/* «базовый» путь развёртывания без языкового сегмента —
   чтобы /ru работал и в корне домена, и в подкаталоге */
function computeBase() {
  const parts = pathSegments();
  if (parts.length && SUPPORTED_LANGS.includes(parts[parts.length - 1])) parts.pop();
  const base = parts.join('/');
  return base === '/' ? '' : base;
}

function langFromPath() {
  const parts = pathSegments();
  const last = parts[parts.length - 1];
  return SUPPORTED_LANGS.includes(last) ? last : null;
}

const BASE = computeBase();

function navigate(lang, { replace = false } = {}) {
  const url = `${BASE}/${lang}${location.search}${location.hash}`;
  try {
    if (replace) history.replaceState({ lang }, '', url);
    else history.pushState({ lang }, '', url);
  } catch (e) {
    /* file:// и т.п. — просто игнорируем */
  }
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

function normalizeLang(lang) {
  return SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG;
}

/**
 * Применяет язык: грузит словарь, переводит DOM, ставит lang/dir,
 * подсвечивает активную кнопку, сохраняет выбор и (опц.) меняет URL.
 * По завершении шлёт событие `i18n:change` с { lang, dict }.
 */
export async function setLanguage(lang, { updateUrl = true, replaceUrl = false } = {}) {
  lang = normalizeLang(lang);

  let dict;
  try {
    dict = await loadLocale(lang);
  } catch (e) {
    console.error(e);
    if (lang === DEFAULT_LANG) return; // дальше падать некуда
    return setLanguage(DEFAULT_LANG, { updateUrl, replaceUrl });
  }

  document.documentElement.lang = lang;
  document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';

  applyTranslations(dict);

  document.querySelectorAll('.lang-switcher [data-lang]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (e) {
    /* приватный режим и т.п. */
  }

  if (updateUrl) navigate(lang, { replace: replaceUrl });

  document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang, dict } }));
}

/** Подключает переключатель языков, кнопки «назад/вперёд» и применяет стартовый язык. */
export function initI18n() {
  document.querySelectorAll('.lang-switcher [data-lang]').forEach((btn) => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  window.addEventListener('popstate', () => {
    setLanguage(langFromPath() || readStored() || DEFAULT_LANG, { updateUrl: false });
  });

  /* приоритет источника языка: путь → сохранённый выбор → язык браузера → дефолт */
  const browser = (navigator.language || '').slice(0, 2);
  const initial = langFromPath()
    || readStored()
    || (SUPPORTED_LANGS.includes(browser) ? browser : null)
    || DEFAULT_LANG;

  /* нормализуем URL к виду …/<lang> без лишней записи в истории */
  setLanguage(initial, { replaceUrl: true });
}
