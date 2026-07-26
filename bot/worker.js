/**
 * «Йорик» Telegram bot — Cloudflare Worker (V2, автоматический разбор).
 *
 * Принимает от оператора: скан/фото программки, PDF, ссылку на афишу,
 * свободный текст или геолокацию. Разбирает через Claude API (structured
 * outputs), показывает предпросмотр + «вы уже встречали …», и по кнопке
 * подтверждения коммитит в GitHub: items/<...>.md + строку в
 * inventory/performances.md (+ скан в playbills/). Push в main автоматически
 * пересобирает сайт (GitHub Actions → Pages).
 *
 * Secrets (wrangler secret put): TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
 *   ANTHROPIC_API_KEY, GITHUB_TOKEN (fine-grained PAT, contents RW на репо).
 * Vars (wrangler.toml): GITHUB_REPO, SITE_URL, MODEL, OPERATOR_CHAT_ID.
 * KV binding: PENDING (ожидающие подтверждения разборы, TTL 24 ч).
 *
 * Развёртывание и правила: runbook/bot.md.
 */

// ---------------------------------------------------------------- транслит

const TRANSLIT = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
  "ж": "zh", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m",
  "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
  "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
  "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
};

export function slugify(text) {
  let out = "";
  for (const ch of String(text).toLowerCase()) {
    if (ch in TRANSLIT) out += TRANSLIT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "") || "x";
}

export function theatreSlug(theatre) {
  if (/Мариинск/i.test(theatre || "")) return "mariinsky";
  if (/консерватори/i.test(theatre || "")) return "consv";
  if (/зарядь/i.test(theatre || "")) return "zaryadye";
  if (/мамт|станиславск|немирович/i.test(theatre || "")) return "mamt";
  if (/внутри/i.test(theatre || "")) return "vnutri";
  return slugify(theatre || "teatr");
}

// ------------------------------------------------------- театры и координаты
// Копия канонической таблицы inventory/venues.md — при изменении там обновить здесь.

const VENUES = [
  { theatre: "Мариинский театр", scene: "Историческая сцена", lat: 59.9256, lon: 30.2961 },
  { theatre: "Мариинский театр", scene: "Мариинский-2", lat: 59.9249, lon: 30.2926 },
  { theatre: "Мариинский театр", scene: "Концертный зал", lat: 59.9243, lon: 30.2895 },
];

export function nearestVenue(lat, lon, maxMeters = 600) {
  let best = null;
  for (const v of VENUES) {
    const dLat = (v.lat - lat) * 111320;
    const dLon = (v.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180);
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (dist <= maxMeters && (!best || dist < best.dist)) best = { ...v, dist };
  }
  return best;
}

// ------------------------------------------------------------- Claude API

const PERF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "genre", "author", "libretto", "source_work", "cycle",
    "theatre", "scene", "date", "time", "language", "duration", "premiere",
    "staff", "cast"],
  properties: {
    title: { type: "string" },
    genre: { type: "string" },
    author: { type: "string" },
    libretto: { type: "string" },
    source_work: { type: "string" },
    cycle: { type: "string" },
    theatre: { type: "string" },
    scene: { type: "string" },
    date: { type: "string" },
    time: { type: "string" },
    language: { type: "string" },
    duration: { type: "string" },
    premiere: { type: "string" },
    staff: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["role", "names"],
        properties: { role: { type: "string" }, names: { type: "array", items: { type: "string" } } },
      },
    },
    cast: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["role", "names"],
        properties: { role: { type: "string" }, names: { type: "array", items: { type: "string" } } },
      },
    },
  },
};

const PARSE_PROMPT = `Это программка/афиша театрального спектакля (или её текст). Извлеки данные ДОСЛОВНО, как напечатано, на языке оригинала (обычно русский). Правила:
- Имена людей — полной формой, как напечатано («Виктория Терешкина», не «В. Терешкина»).
- title: название произведения; genre: жанр (опера/балет/драма/концерт…); author: автор исходного произведения (композитор/драматург), одно имя.
- theatre/scene: театр и подсцена. Для Мариинского theatre всегда «Мариинский театр», scene — одно из: «Историческая сцена», «Мариинский-2», «Концертный зал». Подсказка: в URL афиши mariinsky.ru код сцены перед временем: 1 = Историческая сцена, 2 = Мариинский-2, 3 = Концертный зал.
- date: ГГГГ-ММ-ДД; time: ЧЧ:ММ; premiere: даты премьеры постановки как в тексте.
- staff: постановочная группа (дирижёр, режиссёр, хореограф, художники, хормейстеры…); cast: исполнители с партиями/ролями.
- Неизвестные поля — пустая строка "" или пустой массив. Ничего не выдумывай.`;

async function claude(env, blocks, schema, maxTokens = 8192) {
  const model = env.MODEL || "claude-opus-4-8";
  const outputConfig = { format: { type: "json_schema", schema } };
  if (!/^claude-haiku-/.test(model)) outputConfig.effort = "medium";
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      output_config: outputConfig,
      messages: [{ role: "user", content: blocks }],
    }),
  });
  if (!resp.ok) throw new Error(`Claude API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const msg = await resp.json();
  if (msg.stop_reason === "refusal") throw new Error("Claude отклонил запрос (refusal)");
  const text = (msg.content || []).find((b) => b.type === "text");
  if (!text) throw new Error("Пустой ответ Claude");
  return JSON.parse(text.text);
}

const EVENT_CHOICE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["found", "index"],
  properties: { found: { type: "boolean" }, index: { type: "integer" } },
};

const MARIINSKY_SCENE_BY_CODE = { "1": "Историческая сцена", "2": "Мариинский-2", "3": "Концертный зал" };

/**
 * Разбирает дневную афишу mariinsky.ru (шаблон `shop_obj_title`). Время и сцена
 * закодированы только в href — их нет в видимом тексте, поэтому html нельзя
 * прогонять через stripHtml() перед этим шагом.
 */
export function parseMariinskyDay(html) {
  const events = [];
  const re = /<div class="shop_obj_title"><a href="(\/playbill\/playbill\/\d+\/\d+\/\d+\/(\d)_(\d{4})\/)">([^<]*)<\/a><\/div>/g;
  let match;
  while ((match = re.exec(html))) {
    const [, path, sceneCode, hhmm, titleRaw] = match;
    const title = titleRaw
      .replace(/&amp;/g, "&").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ").trim();
    if (!title) continue;
    events.push({
      url: `https://www.mariinsky.ru${path}`,
      scene: MARIINSKY_SCENE_BY_CODE[sceneCode] || "",
      time: `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`,
      title,
    });
  }
  return events;
}

function normalizeTitle(s) {
  return s.toLowerCase().replace(/ё/g, "е").replace(/[«»"'.,!?]/g, "").replace(/\s+/g, " ").trim();
}

// Времена начала, за пределами текущего окна продаж день-афиша ничего не отдаёт
// (пустой шаблон без событий), но сама страница спектакля по прямой ссылке
// работает — перебираем сцену×время и проверяем HEAD без follow редиректов
// (валидная страница отвечает 200 напрямую; неверная сцена/время — 301 на 404).
const MARIINSKY_PROBE_TIMES = ["1200", "1300", "1400", "1500", "1600", "1700", "1800", "1830", "1900", "1930", "2000"];

async function probeMariinskyDay(y, m, d) {
  const candidates = [];
  for (const scene of Object.keys(MARIINSKY_SCENE_BY_CODE)) {
    for (const time of MARIINSKY_PROBE_TIMES) {
      candidates.push({ scene, time, url: `https://www.mariinsky.ru/playbill/playbill/${y}/${m}/${d}/${scene}_${time}/` });
    }
  }
  const hits = (await Promise.all(candidates.map(async (c) => {
    try {
      const resp = await fetch(c.url, { method: "HEAD", redirect: "manual" });
      return resp.status === 200 ? c : null;
    } catch (e) { return null; }
  }))).filter(Boolean);
  const events = (await Promise.all(hits.map(async (c) => {
    try {
      const html = await (await fetch(c.url)).text();
      const titleMatch = html.match(/<title>([^<]*)<\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : "";
      if (!title) return null;
      return { url: c.url, scene: MARIINSKY_SCENE_BY_CODE[c.scene], time: `${c.time.slice(0, 2)}:${c.time.slice(2)}`, title };
    } catch (e) { return null; }
  }))).filter(Boolean);
  return events;
}

export async function lookupMariinskyEvents(y, m, d) {
  const dayUrl = `https://www.mariinsky.ru/playbill/playbill/${y}/${m}/${d}/`;
  let dayHtml;
  try {
    dayHtml = await (await fetch(dayUrl)).text();
  } catch (e) { return []; }
  let events = parseMariinskyDay(dayHtml);
  if (!events.length) events = await probeMariinskyDay(y, m, d);
  return events.map((e) => ({ ...e, venue: "Мариинский театр" }));
}

/** Изолирует содержимое одного <div class="tab-pane" id="..."> (afisha по дню на mosconsv.ru). */
function extractTabPane(html, id) {
  const marker = `id="${id}" role="tabpanel"`;
  const i = html.indexOf(marker);
  if (i === -1) return "";
  const start = html.indexOf(">", i) + 1;
  const j = html.indexOf('class="tab-pane', start);
  return j === -1 ? html.slice(start) : html.slice(start, j);
}

export async function lookupMosconsvEvents(y, m, d) {
  const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  let html;
  try {
    html = await (await fetch(`https://www.mosconsv.ru/afisha/${dateStr}`)).text();
  } catch (e) { return []; }
  const pane = extractTabPane(html, dateStr);
  if (!pane) return [];
  const events = [];
  for (const block of pane.split('class="row hall-block"').slice(1)) {
    const hallMatch = block.match(/divider-new"><h[0-9][^>]*>([^<]*)<\/h[0-9]>/);
    const scene = hallMatch ? hallMatch[1].trim() : "";
    const eventRe = /<span>(\d+)<\/span><sup>(\d+)<\/sup>[\s\S]*?<a href="(\/ru\/concert\/\d+)">\s*<h6[^>]*>([^<]*)<\/h6>/g;
    let em;
    while ((em = eventRe.exec(block))) {
      const [, hh, mm, path, titleRaw] = em;
      events.push({
        url: `https://www.mosconsv.ru${path}`,
        scene,
        time: `${hh.padStart(2, "0")}:${mm}`,
        title: titleRaw.replace(/\s+/g, " ").trim(),
        date: dateStr,
        venue: "Московская консерватория",
      });
    }
  }
  return events;
}

/** zaryadyehall.ru отдаёт только текущее окно вперёд — архив прошлых дат недоступен. */
export async function lookupZaryadyeEvents() {
  let html;
  try {
    html = await (await fetch("https://zaryadyehall.ru/events/")).text();
  } catch (e) { return []; }
  const events = [];
  for (const row of html.split('class="events__content_row"').slice(1)) {
    const tsMatch = row.match(/data-time-row="(\d+)"/);
    if (!tsMatch) continue;
    // date_xl в тексте не содержит год — берём дату из unix-таймстампа (МСК-полночь).
    const dateStr = new Date((parseInt(tsMatch[1], 10) + 10800) * 1000).toISOString().slice(0, 10);
    const itemRe = /<div class="time">([^<]*)<\/div>\s*<span class="light_text main_font">([^<]*)<\/span>[\s\S]*?<a href="([^"]+)" class="title_link">([\s\S]*?)<\/a>/g;
    let im;
    while ((im = itemRe.exec(row))) {
      const [, timeRaw, hallRaw, href, titleRaw] = im;
      const title = titleRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      events.push({
        url: href.startsWith("http") ? href : `https://zaryadyehall.ru${href}`,
        scene: hallRaw.trim(),
        time: timeRaw.trim(),
        title,
        date: dateStr,
        venue: "Зарядье",
      });
    }
  }
  return events;
}

/**
 * stanmuz.ru: афиша даёт title/date/time/зал, но НЕТ ссылки на программку конкретного
 * показа — только общий список площадки. Время в itemprop="startDate" на сайте расходится
 * с отображаемым текстом на 3 часа (наблюдаемый баг сайта) — доверяем видимому тексту.
 * Только текущее окно продаж, без архива.
 */
export async function lookupMamtEvents() {
  let html;
  try {
    html = await (await fetch("https://www.stanmuz.ru/afisha/")).text();
  } catch (e) { return []; }
  const events = [];
  const re = /class="date" itemprop="startDate" content="(\d{4}-\d{2}-\d{2})T[^"]*"[^>]*>[\s\S]*?<div[^>]*class="time">([^<]*)<\/div>[\s\S]{0,600}?itemprop="name"[^>]*>([^<]*)<\/h3>\s*<p class="sub">([^<]*)<\/p>/g;
  let m;
  while ((m = re.exec(html))) {
    const [, dateStr, timeText, titleRaw, subRaw] = m;
    const timeMatch = timeText.match(/(\d{1,2}:\d{2})/);
    if (!timeMatch) continue;
    const parts = subRaw.split("|").map((s) => s.trim());
    const scene = parts.find((p) => /сцена|зал/i.test(p)) || parts[0] || "";
    events.push({
      url: "",
      scene,
      time: timeMatch[1],
      title: titleRaw.trim(),
      date: dateStr,
      venue: "МАМТ",
    });
  }
  return events;
}

/**
 * vnutri.space (Tilda) — рукописная главная страница, одна запись на постановку (не на
 * конкретный показ), даты без года в духе «вт, ср 14.07, 15.07 18:00, 21:00». Год
 * восстанавливаем эвристикой (ближайшее будущее); при несовпадении числа дат/времён —
 * лучшее возможное сопоставление. Ссылка ведёт на общую страницу спектакля.
 */
export async function lookupVnutriEvents() {
  let html;
  try {
    html = await (await fetch("https://vnutri.space/")).text();
  } catch (e) { return []; }
  const events = [];
  const today = new Date(Date.now() + 3 * 3600e3);
  for (const block of html.split("t513__time t-name t-name_md").slice(1)) {
    const timeBlockMatch = block.match(/field="[^"]*">([\s\S]*?)<\/div>/);
    const titleMatch = block.match(/t513__title[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]*)</);
    if (!timeBlockMatch || !titleMatch) continue;
    const raw = timeBlockMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const dates = [...raw.matchAll(/(\d{1,2})\.(\d{1,2})/g)].map((mm) => [parseInt(mm[1], 10), parseInt(mm[2], 10)]);
    const times = [...raw.matchAll(/(\d{1,2}:\d{2})/g)].map((mm) => mm[1]);
    if (!dates.length || !times.length) continue;
    const [url, titleRaw] = [titleMatch[1], titleMatch[2].trim()];
    const pairs = dates.length === times.length
      ? dates.map((d, i) => [d, times[i]])
      : times.length === 1
      ? dates.map((d) => [d, times[0]])
      : dates.length === 1
      ? times.map((t) => [dates[0], t])
      : dates.flatMap((d) => times.map((t) => [d, t]));
    for (const [[day, month], time] of pairs) {
      // Год не печатается на странице; страница часто слегка отстаёт от реальной
      // даты (наблюдалось), поэтому НЕ подкручиваем вперёд на «следующий год» —
      // это буквально сломало бы совпадение для недавно прошедших дат.
      const year = today.getUTCFullYear();
      events.push({
        url, scene: "", time, title: titleRaw,
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        venue: "Внутри",
      });
    }
  }
  return events;
}

const VENUE_REGISTRY = [
  { match: (t) => /мариинск/i.test(t || ""), lookup: (d) => lookupMariinskyEvents(d.y, d.m, d.d), dateScoped: true },
  { match: (t) => /консерватори/i.test(t || ""), lookup: (d) => lookupMosconsvEvents(d.y, d.m, d.d), dateScoped: true },
  { match: (t) => /зарядь/i.test(t || ""), lookup: lookupZaryadyeEvents, dateScoped: false },
  { match: (t) => /мамт|станиславск|немирович/i.test(t || ""), lookup: lookupMamtEvents, dateScoped: false },
  { match: (t) => /внутри/i.test(t || ""), lookup: lookupVnutriEvents, dateScoped: false },
];

function minimalParsed(pick) {
  return {
    title: pick.title, genre: "", author: "", libretto: "", source_work: "", cycle: "",
    theatre: pick.venue, scene: pick.scene || "", date: pick.date, time: pick.time || "",
    language: "", duration: "", premiere: "", staff: [], cast: [],
  };
}

const FREE_QUERY_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["title", "date", "theatre", "time"],
  properties: {
    title: { type: "string" }, date: { type: "string" }, theatre: { type: "string" }, time: { type: "string" },
  },
};

const FREE_QUERY_PROMPT = `Зритель просит найти в архиве афиши конкретный спектакль по неформальному упоминанию
(например: «Парсифаль 12 октября 2024 в Мариинке»). Извлеки:
- title: название произведения, как упомянуто (не уточняй и не исправляй).
- date: дата спектакля в формате ГГГГ-ММ-ДД. Год обязателен — если год не указан явно и
  не следует из контекста, оставь "".
- theatre: полное официальное название театра/площадки, если понятно из контекста.
  Нормализуй так: «Мариинка»/«Мариинку»/«Мариинском» → «Мариинский театр»; «консерватория»/
  «консерватории»/«консе» → «Московская консерватория»; «Зарядье» → «Зарядье»; «МАМТ»/
  «Станиславского»/«Немировича-Данченко» → «МАМТ»; «Внутри» → «Внутри». Если непонятно
  или это другой театр — "".
- time: время начала в формате ЧЧ:ММ, если указано явно (например, при уточнении после
  вопроса про несколько показов в один день). Иначе "".
Если в сообщении нет узнаваемого названия спектакля ИЛИ даты — верни все поля пустыми
строками (это значит, что это не запрос на поиск, а что-то другое).`;

// ------------------------------------------------------------ рендеринг item

export function renderItem(p, sourceUrl, playbillPath) {
  const f = [];
  const add = (k, v) => { if (v && String(v).trim()) f.push(`- **${k}:** ${String(v).trim()}`); };
  add("Название", p.title);
  add("Жанр", p.genre);
  add("Автор", p.author);
  add("Либретто", p.libretto);
  add("Первоисточник", p.source_work);
  add("Цикл", p.cycle);
  add("Театр", p.theatre);
  add("Сцена", p.scene);
  add("Дата", p.date);
  add("Время", p.time);
  add("Язык", p.language);
  add("Продолжительность", p.duration);
  add("Премьера", p.premiere);
  if (playbillPath) add("Программка", playbillPath);
  if (sourceUrl) add("Источник", sourceUrl);
  const roles = (list) => list
    .filter((r) => r.role && r.names && r.names.length)
    .map((r) => `- ${r.role.trim()} — ${r.names.map((n) => n.trim()).join(", ")}`)
    .join("\n");
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  return `# ${p.title} — ${p.theatre}, ${p.date}

**Type:** performance
**Status:** active

## Facts

${f.join("\n")}

## Постановщики

${roles(p.staff || [])}

## Состав

${roles(p.cast || [])}

## Впечатления

## History

- ${today} — добавлено телеграм-ботом (bot/worker.js), подтверждено оператором
`;
}

export function insertInventoryRow(content, p, fileName) {
  const row = `| ${p.date} | ${p.title} | ${p.theatre} / ${p.scene} | [items/${fileName}](../items/${fileName}) |`;
  const lines = content.split("\n");
  const sepIdx = lines.findIndex((l) => /^\|-+\|/.test(l.replace(/\s/g, "")));
  if (sepIdx === -1) return content + "\n" + row + "\n";
  let insertAt = sepIdx + 1;
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/);
    if (!m) break;
    if (m[1] > p.date) insertAt = i + 1; else break;
  }
  lines.splice(insertAt, 0, row);
  return lines.join("\n");
}

export function peopleOf(p) {
  const names = new Set();
  if (p.author && p.author.trim()) names.add(p.author.replace(/\s*\(.*?\)\s*/g, " ").trim());
  for (const grp of [...(p.staff || []), ...(p.cast || [])]) {
    for (const n of grp.names || []) if (n.trim()) names.add(n.trim());
  }
  return [...names];
}

export function knownPeopleLines(index, names) {
  const lines = [];
  for (const name of names) {
    const entries = index.people && index.people[name];
    if (!entries || !entries.length) continue;
    const seen = entries.slice(0, 4)
      .map((e) => `«${e.title}» (${e.date})`)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ");
    lines.push(`• ${name} — ${seen}`);
  }
  return lines;
}

// ------------------------------------------------------------- GitHub commit

async function gh(env, path, init = {}) {
  const resp = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "mindhorizon-bot",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  if (!resp.ok) throw new Error(`GitHub ${init.method || "GET"} ${path}: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  if (init.raw) return resp.text();
  return resp.headers.get("content-type")?.includes("json") ? resp.json() : resp.text();
}

async function getRawFile(env, path) {
  return gh(env, `/contents/${path}?ref=main`, { raw: true, headers: { Accept: "application/vnd.github.raw+json" } });
}

/** files: [{path, content?} | {path, base64?}] — один атомарный коммит в main. */
async function commitFiles(env, files, message) {
  const ref = await gh(env, "/git/ref/heads/main");
  const baseSha = ref.object.sha;
  const baseCommit = await gh(env, `/git/commits/${baseSha}`);
  const tree = [];
  for (const f of files) {
    const blob = await gh(env, "/git/blobs", {
      method: "POST",
      body: JSON.stringify(f.base64 !== undefined
        ? { content: f.base64, encoding: "base64" }
        : { content: f.content, encoding: "utf-8" }),
    });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = await gh(env, "/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
  });
  const commit = await gh(env, "/git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
  });
  await gh(env, "/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  return commit.sha;
}

// ------------------------------------------------------------------ Telegram

async function tg(env, method, payload) {
  const resp = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return resp.json();
}

function b64encode(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function tgFile(env, fileId) {
  const meta = await tg(env, "getFile", { file_id: fileId });
  if (!meta.ok) throw new Error("getFile failed");
  const resp = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`);
  return { buffer: await resp.arrayBuffer(), path: meta.result.file_path };
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/\s+/g, " ")
    .slice(0, 30000);
}

// ------------------------------------------------------------- основной поток

function preview(p, known) {
  const lines = [
    `🎭 <b>${p.title}</b>${p.genre ? ` (${p.genre})` : ""}`,
    p.author ? `Автор: ${p.author}` : "",
    `${p.theatre}${p.scene ? " · " + p.scene : ""}${p.date ? " · " + p.date : ""}${p.time ? " " + p.time : ""}`,
    p.staff && p.staff.length ? `Постановщики: ${p.staff.length}` : "",
    p.cast && p.cast.length ? `Состав: ${p.cast.map((c) => `${c.role} — ${c.names.join(", ")}`).slice(0, 6).join("; ")}` : "",
  ].filter(Boolean);
  if (known.length) {
    lines.push("", "👀 <b>Вы уже встречали:</b>", ...known);
  }
  return lines.join("\n");
}

async function proposeIngest(env, chatId, parsed, sourceUrl, photos) {
  if (!parsed.title || !parsed.date) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Не удалось распознать название или дату — уточните текстом, пожалуйста." });
    return;
  }
  let known = [];
  try {
    const index = await (await fetch(`${env.SITE_URL}/data/index.json`, { cf: { cacheTtl: 60 } })).json();
    known = knownPeopleLines(index, peopleOf(parsed));
  } catch (e) { /* индекс ещё не опубликован — не критично */ }

  const key = crypto.randomUUID();
  await env.PENDING.put(key, JSON.stringify({ parsed, sourceUrl, photos: photos || [] }), { expirationTtl: 86400 });
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: preview(parsed, known) + "\n\nДобавить в архив?",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Добавить", callback_data: `c:${key}` },
        { text: "❌ Отмена", callback_data: `x:${key}` },
      ]],
    },
  });
}

async function confirmIngest(env, cb) {
  const key = cb.data.slice(2);
  const raw = await env.PENDING.get(key);
  if (!raw) {
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Устарело — пришлите ещё раз" });
    return;
  }
  const { parsed: p, sourceUrl, photos } = JSON.parse(raw);
  const fileName = `${p.date}_${theatreSlug(p.theatre)}_${slugify(p.title)}.md`;
  const files = [];
  const playbillPaths = [];
  (photos || []).forEach((photoB64, i) => {
    const suffix = photos.length > 1 ? `_${i + 1}` : "";
    const path = `playbills/${p.date}_${theatreSlug(p.theatre)}_${slugify(p.title)}${suffix}.jpg`;
    playbillPaths.push(path);
    files.push({ path, base64: photoB64 });
  });
  files.push({ path: `items/${fileName}`, content: renderItem(p, sourceUrl, playbillPaths.join(", ")) });
  const inv = await getRawFile(env, "inventory/performances.md");
  files.push({ path: "inventory/performances.md", content: insertInventoryRow(inv, p, fileName) });
  await commitFiles(env, files, `bot: ingest ${p.title} (${p.date})\n\nПодтверждено оператором в Telegram.`);
  await env.PENDING.delete(key);
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Добавлено ✅" });

  let known = [];
  try {
    const index = await (await fetch(`${env.SITE_URL}/data/index.json`, { cf: { cacheTtl: 60 } })).json();
    known = knownPeopleLines(index, peopleOf(p));
  } catch (e) { /* индекс ещё не опубликован — не критично */ }

  await tg(env, "editMessageText", {
    chat_id: cb.message.chat.id, message_id: cb.message.message_id,
    text: preview(p, known) + `\n\n✅ Добавлено в архив. Сайт пересоберётся через ~1 мин: ${env.SITE_URL}/`,
    parse_mode: "HTML",
  });
}

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Несколько подходящих показов (тот же день) — кнопки вместо просьбы повторить запрос. */
async function proposePick(env, chatId, candidates) {
  const key = crypto.randomUUID();
  await env.PENDING.put(key, JSON.stringify(candidates), { expirationTtl: 900 });
  const sameTitle = new Set(candidates.map((c) => c.title)).size === 1;
  const sameVenue = new Set(candidates.map((c) => c.venue)).size === 1;
  const buttons = candidates.map((c, i) => ([{
    text: truncate(
      sameTitle ? (sameVenue ? `${c.time} · ${c.scene}` : `${c.time} · ${c.venue}`) : `${c.title} — ${c.time}`,
      60,
    ),
    callback_data: `p:${key}:${i}`,
  }]));
  buttons.push([{ text: "❌ Отмена", callback_data: `x:${key}` }]);
  const listLabel = candidates.map((c) => `«${c.title}» — ${c.venue}, ${c.scene}, ${c.time}`).join("\n");
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: `Нашёл несколько подходящих показов:\n${listLabel}\n\nВыберите нужный:`,
    reply_markup: { inline_keyboard: buttons },
  });
}

async function confirmPick(env, cb) {
  const [key, idxStr] = cb.data.slice(2).split(":");
  const raw = await env.PENDING.get(key);
  if (!raw) {
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Устарело — повторите запрос" });
    return;
  }
  const candidates = JSON.parse(raw);
  const chosen = candidates[parseInt(idxStr, 10)];
  await env.PENDING.delete(key);
  if (!chosen) {
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Ошибка выбора" });
    return;
  }
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Выбрано" });
  const chatId = cb.message.chat.id;
  if (chosen.url) {
    await tg(env, "editMessageText", {
      chat_id: chatId, message_id: cb.message.message_id,
      text: `🎭 ${chosen.title} (${chosen.venue}, ${chosen.scene}, ${chosen.time}). Разбираю программку…`,
    });
    await handleUrl(env, chatId, chosen.url, { theatre: chosen.venue, scene: chosen.scene, date: chosen.date, time: chosen.time });
  } else {
    await tg(env, "editMessageText", {
      chat_id: chatId, message_id: cb.message.message_id,
      text: `🎭 ${chosen.title} (${chosen.venue}, ${chosen.scene}, ${chosen.time}). Программки на сайте нет — добавляю базовые данные.`,
    });
    await proposeIngest(env, chatId, minimalParsed(chosen), "", []);
  }
}

async function handleLocation(env, chatId, loc) {
  const venue = nearestVenue(loc.latitude, loc.longitude);
  if (!venue) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Рядом нет известных театров (пока знаю только Мариинский). Пришлите ссылку или скан программки." });
    return;
  }
  const now = new Date(Date.now() + 3 * 3600e3); // Мск/СПб = UTC+3
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, d = now.getUTCDate();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  await tg(env, "sendMessage", { chat_id: chatId, text: `📍 Похоже, вы в: ${venue.theatre} (${venue.scene}). Ищу, что идёт сегодня…` });
  const dayUrl = `https://www.mariinsky.ru/playbill/playbill/${y}/${m}/${d}/`;
  const dayHtml = await (await fetch(dayUrl)).text();
  const toMin = (t) => { const [h, mi] = t.split(":").map(Number); return h * 60 + mi; };
  const events = parseMariinskyDay(dayHtml)
    .filter((e) => e.scene === venue.scene)
    .sort((a, b) => toMin(a.time) - toMin(b.time));
  const pick = events.filter((e) => toMin(e.time) <= nowMin).pop() || events[0];
  if (!pick) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `Не нашёл идущий сейчас спектакль в «${venue.scene}». Пришлите ссылку на событие вручную.` });
    return;
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: `🎭 Сейчас: ${pick.title} (${pick.scene}, ${pick.time}). Разбираю программку…` });
  await handleUrl(env, chatId, pick.url);
}

async function handleUrl(env, chatId, url, overrides) {
  const pageText = stripHtml(await (await fetch(url)).text());
  const parsed = await claude(env, [{
    type: "text",
    text: `${PARSE_PROMPT}\n\nURL страницы: ${url}\n\nТекст страницы:\n${pageText}`,
  }], PERF_SCHEMA);
  if (overrides) Object.assign(parsed, overrides);
  await proposeIngest(env, chatId, parsed, url, []);
}

async function lookupByTitleDate(env, chatId, title, date, theatre, time) {
  const m2 = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m2) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Не смог разобрать дату — уточните в формате «ДД месяц ГГГГ» или «ГГГГ-ММ-ДД»." });
    return;
  }
  const [, y, mm, dd] = m2;
  const dateStr = `${y}-${mm}-${dd}`;
  const ymd = { y: parseInt(y, 10), m: parseInt(mm, 10), d: parseInt(dd, 10) };

  let venues = VENUE_REGISTRY;
  if (theatre) {
    venues = VENUE_REGISTRY.filter((v) => v.match(theatre));
    if (!venues.length) {
      await tg(env, "sendMessage", { chat_id: chatId, text: `Пока не умею искать в афише «${theatre}». Пришлите ссылку на страницу спектакля вручную.` });
      return;
    }
  }

  await tg(env, "sendMessage", { chat_id: chatId, text: `🔎 Ищу «${title}» на ${dateStr}…` });

  const results = await Promise.all(venues.map(async (v) => {
    try {
      const all = await v.lookup(ymd);
      return v.dateScoped ? all : all.filter((e) => e.date === dateStr);
    } catch (e) { return []; }
  }));
  const events = results.flat();

  if (!events.length) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `На ${dateStr} ничего не нашёл. Пришлите ссылку на страницу спектакля вручную.` });
    return;
  }
  const norm = normalizeTitle(title);
  const exact = events.filter((e) => normalizeTitle(e.title) === norm);
  const candidates = exact.length
    ? exact
    : events.filter((e) => normalizeTitle(e.title).includes(norm) || norm.includes(normalizeTitle(e.title)));
  let pick = null;
  if (candidates.length === 1) {
    pick = candidates[0];
  } else if (candidates.length > 1) {
    const byTime = time ? candidates.filter((e) => e.time === time) : [];
    if (byTime.length === 1) pick = byTime[0];
    if (!pick) {
      await proposePick(env, chatId, candidates);
      return;
    }
  }
  if (!pick && events.length > 1) {
    const listText = events.map((e, i) => `${i}. «${e.title}» — ${e.venue}, ${e.scene}, ${e.time}`).join("\n");
    const choice = await claude(env, [{
      type: "text",
      text: `Зритель ищет спектакль «${title}» на ${dateStr}. Вот найденные события:\n${listText}\n\nВерни номер (index) события, которое соответствует запросу (учитывай сокращения и разговорные варианты названия). Если ни одно не подходит — found=false.`,
    }], EVENT_CHOICE_SCHEMA, 512);
    if (choice.found && events[choice.index]) pick = events[choice.index];
  }
  if (!pick) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `Не нашёл «${title}» на ${dateStr}. Пришлите ссылку на страницу спектакля вручную.` });
    return;
  }
  if (pick.url) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `🎭 Нашёл: ${pick.title} (${pick.venue}, ${pick.scene}, ${pick.time}). Разбираю программку…` });
    await handleUrl(env, chatId, pick.url, { theatre: pick.venue, scene: pick.scene, date: pick.date || dateStr, time: pick.time });
  } else {
    await tg(env, "sendMessage", { chat_id: chatId, text: `🎭 Нашёл: ${pick.title} (${pick.venue}, ${pick.scene}, ${pick.time}). Программки на сайте нет — добавляю базовые данные, детали (постановщики, состав) можно дописать вручную.` });
    await proposeIngest(env, chatId, minimalParsed(pick), "", []);
  }
}

async function handleFreeText(env, chatId, text) {
  const q = await claude(env, [
    { type: "text", text: `${FREE_QUERY_PROMPT}\n\nСообщение зрителя:\n${text}` },
  ], FREE_QUERY_SCHEMA, 1024);
  if (q.title && q.date) {
    await lookupByTitleDate(env, chatId, q.title, q.date, q.theatre, q.time);
    return;
  }
  const parsed = await claude(env, [
    { type: "text", text: `${PARSE_PROMPT}\n\nОписание от зрителя:\n${text}` },
  ], PERF_SCHEMA);
  await proposeIngest(env, chatId, parsed, "", []);
}

async function handlePhoto(env, chatId, message) {
  const sizes = message.photo;
  const fileId = sizes[sizes.length - 1].file_id;
  const { buffer } = await tgFile(env, fileId);
  const b64 = b64encode(buffer);
  const context = message.caption ? `\nПодпись от зрителя: ${message.caption}` : "";
  const parsed = await claude(env, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
    { type: "text", text: PARSE_PROMPT + context },
  ], PERF_SCHEMA);
  await proposeIngest(env, chatId, parsed, "", [b64]);
}

/**
 * Несколько фото, отправленных одним альбомом (media_group_id), приходят как отдельные
 * webhook-обновления — каждое в своём вызове Worker'а. Копим страницы в KV; каждый вызов
 * ждёт короткую паузу и затем проверяет, не пришла ли за это время следующая страница —
 * если нет, он последний и разбирает альбом целиком; если да, молча выходит (разбором
 * займётся тот вызов, что окажется последним).
 */
async function handlePhotoGroup(env, chatId, message) {
  const key = `mg:${message.media_group_id}`;
  const sizes = message.photo;
  const fileId = sizes[sizes.length - 1].file_id;

  const raw = await env.PENDING.get(key);
  const items = raw ? JSON.parse(raw) : [];
  items.push({ fileId, caption: message.caption || "" });
  await env.PENDING.put(key, JSON.stringify(items), { expirationTtl: 60 });
  const myCount = items.length;

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const raw2 = await env.PENDING.get(key);
  const current = raw2 ? JSON.parse(raw2) : [];
  if (current.length !== myCount) return; // подошли ещё страницы — обработает более поздний вызов

  await env.PENDING.delete(key);
  await tg(env, "sendMessage", { chat_id: chatId, text: `📄 Получил ${current.length} стр. программки, разбираю…` });

  const blocks = [];
  for (const item of current) {
    const { buffer } = await tgFile(env, item.fileId);
    blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64encode(buffer) } });
  }
  const caption = current.map((i) => i.caption).filter(Boolean).join("\n");
  const context = caption ? `\nПодпись от зрителя: ${caption}` : "";
  const parsed = await claude(env, [...blocks, { type: "text", text: PARSE_PROMPT + context }], PERF_SCHEMA);
  await proposeIngest(env, chatId, parsed, "", blocks.map((b) => b.source.data));
}

async function handleDocument(env, chatId, message) {
  const doc = message.document;
  const { buffer } = await tgFile(env, doc.file_id);
  const b64 = b64encode(buffer);
  const context = message.caption ? `\nПодпись от зрителя: ${message.caption}` : "";
  let block;
  if (doc.mime_type === "application/pdf") {
    block = { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } };
  } else if ((doc.mime_type || "").startsWith("image/")) {
    block = { type: "image", source: { type: "base64", media_type: doc.mime_type, data: b64 } };
  } else {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Поддерживаю фото, PDF, ссылки, текст и геолокацию." });
    return;
  }
  const parsed = await claude(env, [block, { type: "text", text: PARSE_PROMPT + context }], PERF_SCHEMA);
  await proposeIngest(env, chatId, parsed, "", doc.mime_type === "application/pdf" ? [] : [b64]);
}

const HELP = `Я — бот архива «Йорик» («Я знал его…»). Присылайте:
• 📷 фото/скан программки (или PDF)
• 🔗 ссылку на страницу спектакля (mariinsky.ru и др.)
• 📝 свободный текст: короткое упоминание («Парсифаль 12 октября 2024 в Мариинке») —
  найду в афише (Мариинский театр, Московская консерватория, Зарядье, МАМТ, Внутри) и
  разберу программку; или подробное описание — разберу как есть
• 📍 геолокацию из театра — угадаю, что вы сейчас смотрите
Каждый разбор я показываю на подтверждение перед записью в архив.`;

async function handleUpdate(env, update) {
  const cb = update.callback_query;
  if (cb) {
    if (String(cb.from.id) !== String(env.OPERATOR_CHAT_ID)) return;
    try {
      if (cb.data.startsWith("c:")) await confirmIngest(env, cb);
      else if (cb.data.startsWith("p:")) await confirmPick(env, cb);
      else if (cb.data.startsWith("x:")) {
        await env.PENDING.delete(cb.data.slice(2));
        await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Отменено" });
        await tg(env, "editMessageText", {
          chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: "❌ Отменено.",
        });
      }
    } catch (e) {
      await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Ошибка ⚠️" });
      await tg(env, "sendMessage", { chat_id: cb.message.chat.id, text: `⚠️ Ошибка: ${String(e).slice(0, 300)}` });
    }
    return;
  }

  const message = update.message;
  if (!message) return;
  const chatId = message.chat.id;
  if (String(message.from.id) !== String(env.OPERATOR_CHAT_ID)) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Это личный архивный бот." });
    return;
  }

  try {
    if (message.location) await handleLocation(env, chatId, message.location);
    else if (message.photo && message.media_group_id) await handlePhotoGroup(env, chatId, message);
    else if (message.photo) await handlePhoto(env, chatId, message);
    else if (message.document) await handleDocument(env, chatId, message);
    else if (message.text && /^\/(start|help)/.test(message.text)) {
      await tg(env, "sendMessage", { chat_id: chatId, text: HELP });
    } else if (message.text && /https?:\/\//.test(message.text)) {
      const url = message.text.match(/https?:\/\/\S+/)[0];
      await tg(env, "sendMessage", { chat_id: chatId, text: "🔗 Разбираю страницу…" });
      await handleUrl(env, chatId, url);
    } else if (message.text) {
      await handleFreeText(env, chatId, message.text);
    }
  } catch (e) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `⚠️ Ошибка: ${String(e).slice(0, 300)}` });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/webhook") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("forbidden", { status: 403 });
      }
      const update = await request.json();
      ctx.waitUntil(handleUpdate(env, update));
      return new Response("ok");
    }
    return new Response("Йорик bot OK");
  },
};
