/**
 * «Йорик» Telegram bot — Cloudflare Worker (V2, автоматический разбор).
 *
 * Принимает от оператора: скан/фото программки, PDF, ссылку на афишу,
 * свободный текст или геолокацию. Разбирает через Claude API (structured
 * outputs), показывает предпросмотр + «вы уже встречали …», и по кнопке
 * подтверждения коммитит в GitHub: items/<...>.md + строку в
 * inventory/performances.md (+ скан в playbills/). Для произведений, авторов,
 * коллективов-исполнителей и театров, ещё не описанных в works/ / people/ /
 * inventory/venues.md (по данным опубликованного data/index.json), заодно
 * составляет короткое описание (+ либретто/пересказ сюжета для произведений с
 * сюжетом) и показывает его в предпросмотре — коммитится только вместе с
 * остальным, по той же кнопке подтверждения (см. worksOf/draftWorkNotes/
 * renderWork и authorsOf/collectivesOf/draftParticipantNotes/renderParticipant/
 * insertVenueDescription). Push в main автоматически пересобирает сайт
 * (GitHub Actions → Pages).
 *
 * Secrets (wrangler secret put): TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
 *   ANTHROPIC_API_KEY, GITHUB_TOKEN (fine-grained PAT, contents RW на репо).
 * Vars (wrangler.toml): GITHUB_REPO, SITE_URL, MODEL, ALLOWED_CHAT_IDS (список
 *   через запятую — несколько доверенных Telegram-аккаунтов пишут в один и тот
 *   же архив; см. runbook/bot.md).
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
    "program", "staff", "cast"],
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
    program: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["author", "title"],
        properties: { author: { type: "string" }, title: { type: "string" } },
      },
    },
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
- title: название произведения; genre: жанр (опера/балет/драма/концерт…); author: автор исходного произведения (композитор/драматург), одно имя, ИМЕНИТЕЛЬНЫЙ падеж (кто, а не кого) — даже если на странице он упомянут в другом падеже (например, «по операм Вагнера» → «Рихард Вагнер»); ПОЛНЫМ именем, даже если на программке напечатаны только инициалы известного автора (например, «В. А. Моцарт» → «Вольфганг Амадей Моцарт», «Ф. Мендельсон» → «Феликс Мендельсон») — так же, как для имён людей выше; то же для program[].author. Падеж и полнота имени важны: сайт связывает повторные встречи с одним и тем же автором по точному совпадению строки, и сокращённая форма создаёт для сайта отдельного, «нового» автора вместо уже задокументированного.
- program: ТОЛЬКО для сборных концертов из нескольких самостоятельных произведений разных
  авторов — по одной записи {author, title} на произведение, в порядке программы. Если
  исполняется одно произведение целиком (опера/балет) — program: [] (пустой массив), эта
  информация уже в title/author. Когда program непустой, title — название концерта/события
  (как напечатано), а author можно оставить "".
- theatre/scene: театр и подсцена — площадка, ГДЕ проходит показ (адрес/логотип зала на
  программке), а НЕ название коллектива-исполнителя. Гастролирующий коллектив часто называется
  по своему домашнему театру (например, «Симфонический оркестр Мариинского театра») и играет в
  другом зале — не путай название оркестра/хора/ансамбля в title или cast с theatre; theatre
  определяется только фактическим местом показа. Для Мариинского theatre всегда «Мариинский
  театр», scene — одно из: «Историческая сцена», «Мариинский-2», «Концертный зал». Подсказка: в
  URL афиши mariinsky.ru код сцены перед временем: 1 = Историческая сцена, 2 = Мариинский-2,
  3 = Концертный зал. Для Зарядья theatre всегда «Концертный зал "Зарядье"» (даже если в
  программке напечатано разговорное «Зал Зарядье» — это то же самое место), scene — одно из:
  «Большой зал», «Малый зал». Для Московской консерватории theatre всегда «Московская
  консерватория», scene — одно из: «Большой зал», «Малый зал», «Рахманиновский зал» — НЕ
  составной строкой вида «Большой зал консерватории» целиком ни в theatre, ни в scene: раздели
  на театр (Московская консерватория) и сцену (Большой зал), даже если на программке напечатано
  одной строкой без явного названия театра.
- date: ГГГГ-ММ-ДД; time: ЧЧ:ММ; premiere: даты премьеры постановки как в тексте.
- staff: постановочная группа (дирижёр, режиссёр, хореограф, художники, хормейстеры…); cast: исполнители с партиями/ролями.
- Если в программке отдельным блоком назван коллектив-исполнитель (оркестр, хор, ансамбль —
  например «Оркестр — Персимфанс»), включи его в cast отдельной строкой с ролью-типом
  коллектива («Оркестр», «Хор», «Ансамбль» и т.п.) и названием коллектива как единственным
  именем — даже если коллектив описан общим текстом/врезкой, а не в табличном списке партий.
- Неизвестные поля — пустая строка "" или пустой массив. Ничего не выдумывай.`;

const WORK_NOTES_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["works"],
  properties: {
    works: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "description", "libretto"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          libretto: { type: "string" },
        },
      },
    },
  },
};

const WORK_NOTES_PROMPT = `Для каждого произведения из списка ниже (в формате «автор — название»,
пронумерованы) дай:
- description: 2–4 предложения — что это за произведение, в каком стиле/контексте (для
  широкой аудитории, не музыковедческий разбор).
- libretto: краткий пересказ сюжета по актам (несколько предложений), ТОЛЬКО если у
  произведения есть сюжет/либретто (опера, балет, драма). Для произведений без сюжета
  (симфония, инструментальный концерт, увертюра без программы, сюита и т.п.) — пустая строка "".
Используй только общеизвестные, надёжно установленные факты. Если ты не уверен, что это за
произведение (незнакомое/редкое название, неоднозначная атрибуция) — верни пустые строки для
обоих полей, НИЧЕГО не выдумывай.
Верни ровно столько объектов, сколько произведений в списке, В ТОМ ЖЕ порядке; поле title —
скопируй название точно как дано (нужно для сверки).

Список произведений:
`;

/** Произведения из разобранной программки: сборный концерт → каждый номер программы;
 *  цельный спектакль (опера/балет) → единственная запись из title/author. */
export function worksOf(p) {
  const list = (p.program || [])
    .filter((w) => w.title && w.title.trim())
    .map((w) => ({ author: (w.author || "").trim(), title: w.title.trim() }));
  if (list.length) return list;
  if (p.title && p.title.trim()) return [{ author: (p.author || "").trim(), title: p.title.trim() }];
  return [];
}

/** Произведения из pendingWorks, для которых в опубликованном индексе ещё нет works/<slug>.md. */
export function undocumentedWorks(index, works) {
  const documented = (index && index.works) || {};
  const seen = new Set();
  return works.filter((w) => {
    if (seen.has(w.title)) return false;
    seen.add(w.title);
    return !documented[w.title]?.documented;
  });
}

/** Программки печатают одно и то же произведение то в кавычках, то без («Болеро» /
 *  Болеро) — по точному совпадению строки это два разных title и, что хуже, оба
 *  slugify() в один и тот же файл works/<slug>.md, так что новый черновик молча
 *  затирает уже задокументированный профиль. Приводим title к уже известной
 *  задокументированной форме (сверка без кавычек/регистра/ё), если она есть в индексе,
 *  ДО проверки undocumentedWorks — мутирует parsed на месте, тем же title спектакль и
 *  запишется в items/. Возвращает список замен — оператор должен увидеть их в превью
 *  ДО подтверждения, а не узнавать о них постфактум из файла (см.
 *  sessions/2026-08-02_llm-output-gates.md). */
export function canonicalizeWorkTitles(index, parsed) {
  const documented = (index && index.works) || {};
  const canonical = new Map();
  for (const title of Object.keys(documented)) canonical.set(normalizeTitle(title), title);
  const changes = [];
  const resolve = (title) => {
    const match = canonical.get(normalizeTitle(title));
    if (match && match !== title) changes.push({ kind: "произведение", from: title, to: match });
    return match || title;
  };
  if (parsed.program?.length) {
    for (const w of parsed.program) w.title = resolve(w.title);
  } else if (parsed.title) {
    parsed.title = resolve(parsed.title);
  }
  return changes;
}

/** Театр печатается то полным официальным названием, то разговорным вариантом («Зал
 *  Зарядье» / «Концертный зал "Зарядье"») — точное совпадение их не связывает, и
 *  insertVenueDescription() молча создаёт вторую секцию в inventory/venues.md вместо
 *  того чтобы найти уже существующую. Эвристика: сравниваем по «отличительному» слову
 *  названия, отбросив общие «зал/театр/концертный/сцена/дворец/дом» — если ровно один уже
 *  задокументированный театр разделяет с parsed.theatre такое слово, считаем это тем же
 *  местом. Единственное совпадение — иначе (0 или >1) не трогаем: разночтение должно быть
 *  однозначным, чтобы не подменить театр по ошибке. */
const VENUE_STOPWORDS = /^(зал|театр|концертный|сцена|дворец|дом|им\.?)$/i;
export function venueKeywords(name) {
  return name.toLowerCase().replace(/[«»"]/g, "").split(/\s+/).filter((w) => w && !VENUE_STOPWORDS.test(w));
}
export function canonicalizeTheatre(index, parsed) {
  if (!parsed.theatre) return null;
  const known = Object.keys((index && index.venues) || {});
  if (known.includes(parsed.theatre)) return null;
  const parsedKw = venueKeywords(parsed.theatre);
  if (!parsedKw.length) return null;
  const matches = known.filter((t) => venueKeywords(t).some((w) => parsedKw.includes(w)));
  if (matches.length !== 1) return null;
  const from = parsed.theatre;
  parsed.theatre = matches[0];
  return { kind: "театр", from, to: matches[0] };
}

/** Композиторов/драматургов на программках часто печатают инициалами («В. А. Моцарт»),
 *  а уже задокументированный профиль — полным именем («Вольфганг Амадей Моцарт»): точное
 *  совпадение их не связывает, и бот заводит второй, «новый» профиль того же человека.
 *  Сопоставление по фамилии (последнее слово) + совпадению начальных букв имени/отчества с
 *  инициалами — сознательно НЕ применяется к обычному составу/постановщикам (authorsOf
 *  берёт только автора произведения): однофамильцы среди исполнителей — обычное дело, а
 *  автор, по конвенции архива, всегда одна и та же каноническая сущность (см.
 *  people/_template.md, P-shared-facts-own-entity). */
export function matchAbbreviatedName(shortName, knownNames) {
  const shortTokens = shortName.trim().split(/\s+/);
  const shortSurname = shortTokens[shortTokens.length - 1].toLowerCase();
  const initials = shortTokens.slice(0, -1);
  if (!initials.length || !initials.every((t) => /^[а-яё]\.?$/i.test(t))) return null;
  for (const full of knownNames) {
    const fullTokens = full.trim().split(/\s+/);
    if (fullTokens.length <= initials.length) continue;
    if (fullTokens[fullTokens.length - 1].toLowerCase() !== shortSurname) continue;
    const given = fullTokens.slice(0, -1);
    if (given.length < initials.length) continue;
    if (initials.every((init, i) => given[i] && given[i][0].toLowerCase() === init[0].toLowerCase())) return full;
  }
  return null;
}
export function canonicalizeAuthorNames(index, parsed) {
  const known = Object.keys((index && index.people) || {});
  const changes = [];
  const resolve = (name) => {
    if (!name) return name;
    const match = matchAbbreviatedName(name, known);
    if (match) changes.push({ kind: "автор", from: name, to: match });
    return match || name;
  };
  if (parsed.author) parsed.author = resolve(parsed.author);
  for (const w of parsed.program || []) if (w.author) w.author = resolve(w.author);
  return changes;
}

/** Механические проверки, не требующие индекса — предупреждают оператора В ПРЕВЬЮ, ДО
 *  подтверждения, вместо того чтобы дефект ушёл в архив незамеченным. Не блокируют — место
 *  для будущих мягких проверок (в отличие от пустого Театра, который теперь жёсткий гейт —
 *  см. askForVenue() — потому что мягкое предупреждение однажды всё же было подтверждено
 *  оператором «как есть», см. sessions/2026-08-03_hard-venue-gate.md). Сейчас проверок нет —
 *  функция намеренно оставлена как точка расширения. */
export function gateWarnings(parsed) {
  const warnings = [];
  return warnings;
}

async function draftWorkNotes(env, works) {
  if (!works.length) return [];
  const listText = works.map((w, i) => `${i + 1}. ${w.author ? `${w.author} — ` : ""}${w.title}`).join("\n");
  const result = await claude(env, [
    { type: "text", text: WORK_NOTES_PROMPT + listText },
  ], WORK_NOTES_SCHEMA, 4096);
  const notes = result.works || [];
  return works.map((w, i) => ({ ...w, description: notes[i]?.description || "", libretto: notes[i]?.libretto || "" }));
}

export function renderWork(w) {
  const f = [];
  const add = (k, v) => { if (v && String(v).trim()) f.push(`- **${k}:** ${String(v).trim()}`); };
  add("Название", w.title);
  add("Автор", w.author);
  add("Жанр", w.genre);
  add("Описание", w.description);
  add("Либретто", w.libretto);
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  return `# ${w.title}

**Type:** work
**Status:** active

## Facts

${f.join("\n")}

## History

- ${today} — добавлено телеграм-ботом (bot/worker.js) при разборе программки, подтверждено оператором
`;
}

/** Без явного таймаута fetch() к Anthropic может провисеть дольше лимита времени
 *  выполнения Worker'а — платформа тогда молча убивает инстанс ДО того, как успеет
 *  сработать catch в handleUpdate, и оператор не получает вообще никакого ответа
 *  (см. sessions/2026-08-02_bot-photo-timeout.md). AbortController здесь превращает
 *  зависание в обычную catchable-ошибку с понятным текстом. */
// ------------------------------------------------------ журнал последнего разбора (/log)

/** Одна запись в KV под фиксированным ключом — не история, а срез «что произошло в
 *  последний раз», для команды /log («покажи, что именно случилось»). startLog()
 *  ПЕРЕЗАПИСЫВАЕТ запись целиком (новый разбор не должен унаследовать committed/files
 *  предыдущего); updateLog() дополняет её же на более поздних этапах того же разбора
 *  (proposeIngest, confirmIngest) — они всегда идут ПОСЛЕ вызова claude() в одном и том же
 *  жизненном цикле разбора. Ошибки самого логирования не должны ронять разбор — только try. */
const LOG_KEY = "log:last";
export async function startLog(env, patch) {
  const entry = { ts: new Date().toISOString(), ...patch };
  try { await env.PENDING.put(LOG_KEY, JSON.stringify(entry)); } catch (e) { /* не критично */ }
  return entry;
}
export async function updateLog(env, patch) {
  let entry = {};
  try {
    const raw = await env.PENDING.get(LOG_KEY);
    if (raw) entry = JSON.parse(raw);
  } catch (e) { /* повреждённая запись — начинаем заново */ }
  entry = { ...entry, ...patch };
  try { await env.PENDING.put(LOG_KEY, JSON.stringify(entry)); } catch (e) { /* не критично */ }
  return entry;
}

/** source — короткая метка вызывающего потока («photo», «photo-group», «document», «url»,
 *  «free-text»); передаётся только вызовами, разбирающими программку целиком (PERF_SCHEMA) —
 *  вспомогательные вызовы (черновики описаний, поиск по афише) в /log не попадают. */
async function claude(env, blocks, schema, maxTokens = 8192, source = null) {
  const model = env.MODEL || "claude-sonnet-5";
  const startedAt = Date.now();
  try {
    const outputConfig = { format: { type: "json_schema", schema } };
    if (!/^claude-haiku-/.test(model)) outputConfig.effort = "medium";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let resp;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
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
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") throw new Error("Claude API не ответил за 45с (таймаут) — попробуйте ещё раз или пришлите скан попроще");
      throw e;
    } finally {
      clearTimeout(timeout);
    }
    if (!resp.ok) throw new Error(`Claude API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const msg = await resp.json();
    if (msg.stop_reason === "refusal") throw new Error("Claude отклонил запрос (refusal)");
    const text = (msg.content || []).find((b) => b.type === "text");
    if (!text) throw new Error("Пустой ответ Claude");
    const parsed = JSON.parse(text.text);
    if (source) await startLog(env, { source, model, durationMs: Date.now() - startedAt, ok: true, parsed });
    return parsed;
  } catch (e) {
    if (source) await startLog(env, { source, model, durationMs: Date.now() - startedAt, ok: false, error: String(e.message || e).slice(0, 500) });
    throw e;
  }
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
        venue: `Концертный зал "Зарядье"`,
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
    language: "", duration: "", premiere: "", program: [], staff: [], cast: [],
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
  «консерватории»/«консе» → «Московская консерватория»; «Зарядье»/«Зал Зарядье» → «Концертный зал "Зарядье"»; «МАМТ»/
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
  const programLines = (p.program || [])
    .filter((w) => w.author && w.title)
    .map((w) => `- ${w.author.trim()} — ${w.title.trim()}`)
    .join("\n");
  const programSection = programLines ? `\n## Программа\n\n${programLines}\n` : "";
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  return `# ${p.title} — ${p.theatre}, ${p.date}

**Type:** performance
**Status:** active

## Facts

${f.join("\n")}
${programSection}
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
  for (const w of p.program || []) {
    if (w.author && w.author.trim()) names.add(w.author.replace(/\s*\(.*?\)\s*/g, " ").trim());
  }
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

/** Авторы исходного произведения (композитор/драматург) — заводятся всегда, даже при
 *  единственной встрече, в отличие от остальных участников (см. people/_template.md). */
export function authorsOf(p) {
  const names = new Set();
  const add = (n) => { if (n && n.trim() && !/^Неизвестн/.test(n.trim())) names.add(n.replace(/\s*\(.*?\)\s*/g, " ").trim()); };
  add(p.author);
  for (const w of p.program || []) add(w.author);
  return [...names];
}

/** Коллективы-исполнители (оркестр/хор/ансамбль) — распознаются по точной роли в
 *  ## Постановщики/## Состав, как их описывает PARSE_PROMPT. Заводятся всегда, как и авторы. */
export function collectivesOf(p) {
  const names = new Set();
  for (const grp of [...(p.staff || []), ...(p.cast || [])]) {
    if (!/^(оркестр|хор|ансамбль)$/i.test((grp.role || "").trim())) continue;
    for (const n of grp.names || []) if (n.trim()) names.add(n.trim());
  }
  return [...names];
}

/** Фильтрует к тем, для кого ещё нет people/<slug>.md (по опубликованному индексу). */
export function undocumentedParticipants(index, names) {
  const profiled = new Set(index.profiled_people || []);
  const seen = new Set();
  return names.filter((n) => {
    if (seen.has(n) || profiled.has(n)) return false;
    seen.add(n);
    return true;
  });
}

const PARTICIPANT_NOTES_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["entries"],
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "description"],
        properties: { name: { type: "string" }, description: { type: "string" } },
      },
    },
  },
};

const PARTICIPANT_NOTES_PROMPT = `Для каждой позиции ниже (тип в квадратных скобках, затем имя)
дай короткое (2–3 предложения) описание:
- [автор]: композитор/драматург — кто это, эпоха, чем известен.
- [коллектив]: оркестр/хор/ансамбль — что это за коллектив, при каком театре/учреждении.
- [театр]: концертный зал/театр — что это за площадка, где находится, чем примечательна.
Используй только общеизвестные, надёжно установленные факты. Если ты не уверен (незнакомое
имя, неоднозначная атрибуция) — верни пустую строку для description, НИЧЕГО не выдумывай.
Верни ровно столько объектов, сколько позиций в списке, В ТОМ ЖЕ порядке; поле name — скопируй
точно как дано.

Список:
`;

async function draftParticipantNotes(env, entries) {
  if (!entries.length) return [];
  const listText = entries.map((e, i) => `${i + 1}. [${e.kind}] ${e.name}`).join("\n");
  const result = await claude(env, [
    { type: "text", text: PARTICIPANT_NOTES_PROMPT + listText },
  ], PARTICIPANT_NOTES_SCHEMA, 4096);
  const notes = result.entries || [];
  return entries.map((e, i) => ({ ...e, description: notes[i]?.description || "" }));
}

export function renderParticipant(entry) {
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const type = entry.kind === "коллектив" ? "collective" : "person";
  return `# ${entry.name}

**Type:** ${type}
**Status:** active

## Facts

- **Имя:** ${entry.name}
- **Фото:**
- **Коротко:** ${entry.description}
- **Био:** ${entry.description}

## History

- ${today} — добавлено телеграм-ботом (bot/worker.js) при разборе программки, подтверждено оператором
`;
}

/** Вставляет короткое описание театра в inventory/venues.md — под существующий заголовок
 *  «## <театр>», если он уже есть (площадка известна, но пока без описания), иначе добавляет
 *  новую секцию в конец файла (адрес/координаты остаются для ручного заполнения — см.
 *  runbook/bot.md). */
export function insertVenueDescription(content, theatre, description) {
  const heading = `## ${theatre}`;
  const idx = content.indexOf(heading);
  if (idx === -1) {
    const sep = content.endsWith("\n") ? "" : "\n";
    return `${content}${sep}\n${heading}\n\n${description}\n\n- (адрес и координаты не указаны — уточнить)\n`;
  }
  const afterHeading = idx + heading.length;
  return `${content.slice(0, afterHeading)}\n\n${description}${content.slice(afterHeading)}`;
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

function preview(p, known, workNotes, participantNotes, changes, warnings) {
  const lines = [
    `🎭 <b>${p.title}</b>${p.genre ? ` (${p.genre})` : ""}`,
    !p.program?.length && p.author ? `Автор: ${p.author}` : "",
    `${p.theatre}${p.scene ? " · " + p.scene : ""}${p.date ? " · " + p.date : ""}${p.time ? " " + p.time : ""}`,
    p.program && p.program.length ? `Программа: ${p.program.map((w) => `${w.author} — ${w.title}`).slice(0, 4).join("; ")}${p.program.length > 4 ? "…" : ""}` : "",
    p.staff && p.staff.length ? `Постановщики: ${p.staff.length}` : "",
    p.cast && p.cast.length ? `Состав: ${p.cast.map((c) => `${c.role} — ${c.names.join(", ")}`).slice(0, 6).join("; ")}` : "",
  ].filter(Boolean);
  if ((warnings || []).length) {
    lines.push("", "⚠️ <b>Проверьте перед подтверждением:</b>");
    for (const w of warnings) lines.push(`• ${w}`);
  }
  if ((changes || []).length) {
    lines.push("", "🔗 <b>Приведено к уже известной форме:</b>");
    for (const c of changes) lines.push(`• [${c.kind}] ${c.from} → ${c.to}`);
  }
  if (known.length) {
    lines.push("", "👀 <b>Вы уже встречали:</b>", ...known);
  }
  const withNotes = (workNotes || []).filter((w) => w.description);
  if (withNotes.length) {
    lines.push("", "🎼 <b>Новые произведения (описание составлено ботом):</b>");
    for (const w of withNotes) {
      lines.push(`• <i>${w.title}</i> — ${w.description}${w.libretto ? " (+ либретто)" : ""}`);
    }
  }
  const withParticipants = (participantNotes || []).filter((e) => e.description);
  if (withParticipants.length) {
    lines.push("", "👤 <b>Новые участники (описание составлено ботом):</b>");
    for (const e of withParticipants) {
      lines.push(`• [${e.kind}] <i>${e.name}</i> — ${e.description}`);
    }
  }
  return lines.join("\n");
}

/** Пустой Театр — жёсткий гейт, не предупреждение: раньше это была строка в gateWarnings()
 *  («Театр не распознан...» в превью), и оператор однажды подтвердил показ с пустым Театром
 *  «как есть» (см. items/2024-06-23_..._simona-kermes...), не заметив предупреждение среди
 *  остального текста превью — пустой Театр ломает группировку по театрам на сайте и
 *  theatreSlug() (даёт заглушку «teatr» вместо реального имени файла), так что риск того же
 *  дефекта того не стоит. Вместо показа превью с дырой — останавливаем разбор и спрашиваем
 *  оператора напрямую (askForVenue), продолжая только после ответа (handleVenueReply). */
export async function askForVenue(env, chatId, parsed, sourceUrl, photos) {
  await env.PENDING.put(venueAskKey(chatId), JSON.stringify({ parsed, sourceUrl, photos: photos || [] }), { expirationTtl: 3600 });
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: `❓ Не удалось определить театр/площадку${parsed.scene ? ` (сцена распознана как «${parsed.scene}»)` : ""}. Напишите, пожалуйста, в каком театре проходил показ — и я продолжу разбор.`,
  });
}

export function venueAskKey(chatId) {
  return `venueask:${chatId}`;
}

/** Ответ на askForVenue() — свободный текст, а не команда/ссылка, поэтому перехватывается в
 *  handleUpdate() раньше обычного handleFreeText(), но только если для этого чата реально
 *  ждали ответ (иначе — false, и сообщение идёт по обычному пути). */
export async function handleVenueReply(env, chatId, venueText) {
  const key = venueAskKey(chatId);
  const raw = await env.PENDING.get(key);
  if (!raw) return false;
  await env.PENDING.delete(key);
  const { parsed, sourceUrl, photos } = JSON.parse(raw);
  parsed.theatre = venueText.trim();
  await updateLog(env, { operatorSuppliedVenue: venueText.trim() });
  await proposeIngest(env, chatId, parsed, sourceUrl, photos);
  return true;
}

/** Тот же показ иногда присылают дважды (перепутали фото, повторно нажали) — 2023-01-20
 *  «Солисты оркестра musicAeterna»/«Камерный концерт» оказались одной и той же записью в
 *  Дом Радио, добавленной дважды за день до этого. Сигнал — совпадение Даты в уже
 *  опубликованном индексе; сам по себе он не абсолютный (утренник+вечер в один день —
 *  редкий, но настоящий случай), поэтому это ВОПРОС оператору (askDuplicateConfirm), а не
 *  автоматический отказ — как и с пустым Театром, риск ложного молчаливого пропуска хуже
 *  риска лишнего вопроса. */
export function findDuplicateCandidates(index, parsed) {
  const perfs = (index && index.performances) || [];
  return perfs.filter((p) => p.date === parsed.date);
}

export async function askDuplicateConfirm(env, chatId, parsed, sourceUrl, photos, dupes) {
  const key = crypto.randomUUID();
  await env.PENDING.put(key, JSON.stringify({ parsed, sourceUrl, photos: photos || [] }), { expirationTtl: 3600 });
  const list = dupes.map((d) => `«${d.title}» (${d.theatre}${d.scene ? " · " + d.scene : ""})`).join(", ");
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: `⚠️ На ${parsed.date} в архиве уже есть: ${list}. Это тот же показ (повторно прислали), или другое событие в тот же день?`,
    reply_markup: { inline_keyboard: [[
      { text: "➕ Это другое, добавить", callback_data: `d:${key}` },
      { text: "❌ Дубликат, не добавлять", callback_data: `x:${key}` },
    ]] },
  });
}

/** «➕ Это другое, добавить» — повторный вызов proposeIngest с skipDuplicateCheck=true, чтобы
 *  не зациклиться на том же предупреждении. */
export async function confirmDuplicateAnyway(env, cb) {
  const key = cb.data.slice(2);
  const raw = await env.PENDING.get(key);
  if (!raw) {
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Устарело — пришлите ещё раз" });
    return;
  }
  await env.PENDING.delete(key);
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Добавляю…" });
  const { parsed, sourceUrl, photos } = JSON.parse(raw);
  await proposeIngest(env, cb.message.chat.id, parsed, sourceUrl, photos, true);
}

async function proposeIngest(env, chatId, parsed, sourceUrl, photos, skipDuplicateCheck) {
  if (!parsed.title || !parsed.date) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Не удалось распознать название или дату — уточните текстом, пожалуйста." });
    return;
  }
  if (!parsed.theatre) {
    await askForVenue(env, chatId, parsed, sourceUrl, photos);
    return;
  }

  let index = null;
  try {
    index = await (await fetch(`${env.SITE_URL}/data/index.json`, { cf: { cacheTtl: 60 } })).json();
  } catch (e) { /* индекс ещё не опубликован — не критично, продолжаем без него */ }

  if (!skipDuplicateCheck && index) {
    const dupes = findDuplicateCandidates(index, parsed);
    if (dupes.length) {
      await askDuplicateConfirm(env, chatId, parsed, sourceUrl, photos, dupes);
      return;
    }
  }

  const warnings = gateWarnings(parsed);
  let known = [];
  let workNotes = [];
  let participantNotes = [];
  let changes = [];
  if (index) {
    try {
      const theatreChange = canonicalizeTheatre(index, parsed);
      changes = [
        ...canonicalizeWorkTitles(index, parsed),
        ...(theatreChange ? [theatreChange] : []),
        ...canonicalizeAuthorNames(index, parsed),
      ];
      known = knownPeopleLines(index, peopleOf(parsed));
      const undocumented = undocumentedWorks(index, worksOf(parsed));
      if (undocumented.length) workNotes = await draftWorkNotes(env, undocumented);

      const entries = [
        ...undocumentedParticipants(index, authorsOf(parsed)).map((name) => ({ kind: "автор", name })),
        ...undocumentedParticipants(index, collectivesOf(parsed)).map((name) => ({ kind: "коллектив", name })),
        ...(parsed.theatre && !index.venues?.[parsed.theatre]?.documented ? [{ kind: "театр", name: parsed.theatre }] : []),
      ];
      if (entries.length) participantNotes = await draftParticipantNotes(env, entries);
    } catch (e) { /* черновик описаний не удался — не критично */ }
  }

  await updateLog(env, { gateWarnings: warnings, canonicalizations: changes, finalParsed: parsed });

  const key = crypto.randomUUID();
  await env.PENDING.put(key, JSON.stringify({ parsed, sourceUrl, photos: photos || [], workNotes, participantNotes }), { expirationTtl: 86400 });
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text: preview(parsed, known, workNotes, participantNotes, changes, warnings) + "\n\nДобавить в архив?",
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
  const { parsed: p, sourceUrl, photos, workNotes, participantNotes } = JSON.parse(raw);
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
  const newWorks = (workNotes || []).filter((w) => w.description);
  for (const w of newWorks) {
    const genre = w.title === p.title && !p.program?.length ? p.genre : "";
    files.push({ path: `works/${slugify(w.title)}.md`, content: renderWork({ ...w, genre }) });
  }
  const newParticipants = (participantNotes || []).filter((e) => e.description && e.kind !== "театр");
  for (const e of newParticipants) {
    files.push({ path: `people/${slugify(e.name)}.md`, content: renderParticipant(e) });
  }
  const newVenue = (participantNotes || []).find((e) => e.kind === "театр" && e.description);
  if (newVenue) {
    const venues = await getRawFile(env, "inventory/venues.md");
    files.push({ path: "inventory/venues.md", content: insertVenueDescription(venues, newVenue.name, newVenue.description) });
  }
  const confirmedBy = cb.from.username ? `@${cb.from.username}` : cb.from.first_name || String(cb.from.id);
  const worksNote = newWorks.length ? `\n\nНовые произведения: ${newWorks.map((w) => w.title).join(", ")}.` : "";
  const participantsNote = newParticipants.length || newVenue
    ? `\n\nНовые участники: ${[...newParticipants.map((e) => e.name), ...(newVenue ? [newVenue.name] : [])].join(", ")}.`
    : "";
  const commitMessage = `bot: ingest ${p.title} (${p.date})\n\nПодтверждено в Telegram: ${confirmedBy}.${worksNote}${participantsNote}`;
  await commitFiles(env, files, commitMessage);
  await env.PENDING.delete(key);
  await updateLog(env, { committed: true, files: files.map((f) => f.path), commitMessage: `bot: ingest ${p.title} (${p.date})` });
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Добавлено ✅" });

  let known = [];
  let newlyRecurring = [];
  try {
    const index = await (await fetch(`${env.SITE_URL}/data/index.json`, { cf: { cacheTtl: 60 } })).json();
    known = knownPeopleLines(index, peopleOf(p));
    // Индекс отражает состояние ДО этого коммита — ровно 1 запись значит, что после
    // добавления текущего спектакля человек станет повторным впервые. Авторы/коллективы
    // исключены — им профиль уже написан этим же коммитом (newParticipants выше), не нужно
    // просить оператора собрать био вручную ещё раз.
    const alreadyProfiledNow = new Set(newParticipants.map((e) => e.name));
    newlyRecurring = peopleOf(p).filter((name) => !alreadyProfiledNow.has(name) && (index.people?.[name]?.length || 0) === 1);
  } catch (e) { /* индекс ещё не опубликован — не критично */ }

  const recurringNote = newlyRecurring.length
    ? `\n\n👤 Впервые повторно: ${newlyRecurring.join(", ")} — стоит собрать био/фото (см. people/_template.md).`
    : "";

  await tg(env, "editMessageText", {
    chat_id: cb.message.chat.id, message_id: cb.message.message_id,
    text: preview(p, known, workNotes, participantNotes) + `\n\n✅ Добавлено в архив. Сайт пересоберётся через ~1 мин: ${env.SITE_URL}/` + recurringNote,
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
  }], PERF_SCHEMA, 8192, "url");
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
  ], PERF_SCHEMA, 8192, "free-text");
  await proposeIngest(env, chatId, parsed, "", []);
}

async function handlePhoto(env, chatId, message) {
  const sizes = message.photo;
  const fileId = sizes[sizes.length - 1].file_id;
  await tg(env, "sendMessage", { chat_id: chatId, text: "📷 Получил, разбираю…" });
  const { buffer } = await tgFile(env, fileId);
  const b64 = b64encode(buffer);
  const context = message.caption ? `\nПодпись от зрителя: ${message.caption}` : "";
  const parsed = await claude(env, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
    { type: "text", text: PARSE_PROMPT + context },
  ], PERF_SCHEMA, 8192, "photo");
  await proposeIngest(env, chatId, parsed, "", [b64]);
}

/**
 * Несколько фото, отправленных одним альбомом (media_group_id), приходят как отдельные
 * webhook-обновления — каждое в своём вызове Worker'а. Копим страницы в KV; каждая страница
 * откладывает (ctx.waitUntil) короткую паузу и проверку, не пришла ли за это время следующая
 * страница — если нет, она последняя и собирает файлы альбома; если да, молча выходит
 * (сбором займётся тот вызов, что окажется последним).
 *
 * КРИТИЧНО: сама функция-обработчик (handlePhotoGroup) должна вернуться быстро, НЕ дожидаясь
 * двухсекундной паузы — Telegram не присылает следующую страницу альбома, пока не получит
 * ответ на webhook текущей (см. fetch() ниже, который теперь дожидается handleUpdate целиком —
 * это исправило тихие обрывы при разборе одиночного фото, но если бы двухсекундная пауза тоже
 * была внутри await-цепочки, каждая страница блокировала бы доставку следующей на те же 2с и
 * ни одна не увидела бы соседей в KV к моменту проверки. Поэтому пауза+сбор файлов вынесены в
 * ctx.waitUntil(finishPhotoGroup(...)) — не блокирует ответ, страницы прилетают быстро одна за
 * другой, как раньше.
 *
 * ТЯЖЁЛЫЙ разбор (claude() с несколькими изображениями) сюда намеренно НЕ входит: тройная
 * страница программки однажды тихо зависла именно на этом шаге — тот же класс проблемы, что
 * чинили для одиночного фото (см. sessions/2026-08-02_waituntil-fix.md), только здесь дожидаться
 * его под await нельзя (блокировало бы доставку соседних страниц). Вместо разбора сразу —
 * finishPhotoGroup только скачивает файлы (лёгкая быстрая сеть, не тяжёлая модель — риск того же
 * фонового убийства намного ниже) и
 * предлагает кнопку «Разобрать»: нажатие — обычный callback_query, который handleUpdate уже
 * дожидается целиком с полным бюджетом времени, так что сам claude() и его таймаут выполняются
 * там же надёжно, как и для одиночного фото (см. parsePhotoGroup ниже).
 */
async function handlePhotoGroup(env, ctx, chatId, message) {
  // Каждая страница пишется в СВОЙ ключ (по message_id, уникален и монотонен в пределах
  // альбома) — не в общий JSON-блоб. KV не даёт атомарного read-modify-write: если бы все
  // страницы читали-дополняли-писали один и тот же список, две почти одновременные
  // страницы могли бы обе прочитать пустой список до того, как другая успеет его
  // записать, и одна запись перезатирала бы другую (потерянное обновление) — именно это
  // и произошло: каждый вызов видел список из одной страницы и считал себя последним.
  const prefix = `mg:${message.media_group_id}:`;
  const myId = message.message_id;
  const sizes = message.photo;
  const fileId = sizes[sizes.length - 1].file_id;
  await env.PENDING.put(`${prefix}${myId}`, JSON.stringify({ fileId, caption: message.caption || "" }), { expirationTtl: 60 });
  ctx.waitUntil(finishPhotoGroup(env, chatId, prefix, myId));
}

async function finishPhotoGroup(env, chatId, prefix, myId) {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const listing = await env.PENDING.list({ prefix });
  const ids = listing.keys.map((k) => parseInt(k.name.slice(prefix.length), 10));
  if (!ids.length || myId !== Math.max(...ids)) return; // не самая поздняя страница — обработает она сама

  ids.sort((a, b) => a - b);
  const items = [];
  for (const id of ids) {
    const raw = await env.PENDING.get(`${prefix}${id}`);
    if (raw) items.push(JSON.parse(raw));
  }
  await Promise.all(ids.map((id) => env.PENDING.delete(`${prefix}${id}`)));

  // Своя try/catch обязательна: это выполняется вне try/catch в handleUpdate (запущено через
  // ctx.waitUntil), и без неё ошибка молча пропадёт.
  try {
    const blocks = [];
    for (const item of items) {
      const { buffer } = await tgFile(env, item.fileId);
      blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64encode(buffer) } });
    }
    const caption = items.map((i) => i.caption).filter(Boolean).join("\n");
    const key = crypto.randomUUID();
    await env.PENDING.put(key, JSON.stringify({ blocks, caption }), { expirationTtl: 900 });
    await tg(env, "sendMessage", {
      chat_id: chatId,
      text: `📄 Получил ${items.length} стр. программки. Разобрать?`,
      reply_markup: { inline_keyboard: [[
        { text: "🔍 Разобрать", callback_data: `g:${key}` },
        { text: "❌ Отмена", callback_data: `x:${key}` },
      ]] },
    });
  } catch (e) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `⚠️ Ошибка: ${String(e).slice(0, 300)}` });
  }
}

/** Нажатие «🔍 Разобрать» — callback_query, а не фоновая задача: handleUpdate дожидается его
 *  целиком (полный бюджет времени, не урезанный waitUntil-грейс-период), так что тяжёлый
 *  claude() и его таймаут (см. claude()) отрабатывают надёжно, как для одиночного фото. */
async function parsePhotoGroup(env, cb) {
  const key = cb.data.slice(2);
  const raw = await env.PENDING.get(key);
  if (!raw) {
    await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Устарело — пришлите фото ещё раз" });
    return;
  }
  await env.PENDING.delete(key);
  const { blocks, caption } = JSON.parse(raw);
  const chatId = cb.message.chat.id;
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Разбираю…" });
  await tg(env, "editMessageText", { chat_id: chatId, message_id: cb.message.message_id, text: "🔍 Разбираю…" });
  const context = caption ? `\nПодпись от зрителя: ${caption}` : "";
  const parsed = await claude(env, [...blocks, { type: "text", text: PARSE_PROMPT + context }], PERF_SCHEMA, 8192, "photo-group");
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
  const parsed = await claude(env, [block, { type: "text", text: PARSE_PROMPT + context }], PERF_SCHEMA, 8192, "document");
  await proposeIngest(env, chatId, parsed, "", doc.mime_type === "application/pdf" ? [] : [b64]);
}

const HELP = `Я — бот архива «Йорик» («Я знал его…»). Присылайте:
• 📷 фото/скан программки (или PDF)
• 🔗 ссылку на страницу спектакля (mariinsky.ru и др.)
• 📝 свободный текст: короткое упоминание («Парсифаль 12 октября 2024 в Мариинке») —
  найду в афише (Мариинский театр, Московская консерватория, Зарядье, МАМТ, Внутри) и
  разберу программку; или подробное описание — разберу как есть
• 📍 геолокацию из театра — угадаю, что вы сейчас смотрите
Каждый разбор я показываю на подтверждение перед записью в архив.
/log — что именно произошло при последнем разборе (модель, длительность, предупреждения, статус).`;

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** /log — «покажи, что именно случилось» при последнем разборе: источник, модель,
 *  длительность, успех/ошибка, сработавшие gate'ы (canonicalizeXxx/gateWarnings из
 *  bot/worker.js) и статус подтверждения — с сырым JSON в конце для отладки. Не история,
 *  а срез последнего разбора (см. startLog/updateLog). */
export async function handleLogCommand(env, chatId) {
  let entry = null;
  try {
    const raw = await env.PENDING.get(LOG_KEY);
    if (raw) entry = JSON.parse(raw);
  } catch (e) { /* повреждённая запись — считаем, что записи нет */ }
  if (!entry) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Пока нет записей о разборе — пришлите программку." });
    return;
  }
  const p = entry.finalParsed || entry.parsed;
  const lines = [
    "📋 <b>Последний разбор</b>",
    `Источник: ${entry.source || "—"}`,
    `Время: ${entry.ts || "—"}`,
    `Модель: ${entry.model || "—"}${entry.durationMs != null ? ` · ${(entry.durationMs / 1000).toFixed(1)}с` : ""}`,
    entry.ok === false ? `Результат: ⚠️ ошибка — ${escapeHtml(entry.error || "неизвестная ошибка")}` : "Результат: ✅ разбор успешен",
  ];
  if (p) {
    lines.push(
      "",
      `Название: ${escapeHtml(p.title || "—")}`,
      `Театр: ${escapeHtml(p.theatre || "—")}${p.scene ? " · " + escapeHtml(p.scene) : ""}`,
      `Дата: ${escapeHtml(p.date || "—")}${p.time ? " " + escapeHtml(p.time) : ""}`,
    );
  }
  if ((entry.gateWarnings || []).length) {
    lines.push("", "⚠️ <b>Предупреждения:</b>", ...entry.gateWarnings.map((w) => `• ${escapeHtml(w)}`));
  }
  if ((entry.canonicalizations || []).length) {
    lines.push("", "🔗 <b>Приведено к канонической форме:</b>",
      ...entry.canonicalizations.map((c) => `• [${escapeHtml(c.kind)}] ${escapeHtml(c.from)} → ${escapeHtml(c.to)}`));
  }
  lines.push(
    "",
    entry.committed
      ? `Статус: ✅ добавлено в архив${entry.commitMessage ? ` (${escapeHtml(entry.commitMessage)})` : ""}`
      : "Статус: ещё не подтверждено (пока не в архиве)",
  );
  if ((entry.files || []).length) lines.push(`Файлы: ${entry.files.map(escapeHtml).join(", ")}`);
  if (p) {
    lines.push("", "<b>Сырой JSON (для отладки):</b>", `<pre>${escapeHtml(JSON.stringify(p, null, 1)).slice(0, 2000)}</pre>`);
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
}

/** ALLOWED_CHAT_IDS — список Telegram user id через запятую; несколько доверенных
 *  аккаунтов (например, супруг(а) и второй личный аккаунт) пишут в один и тот же архив. */
function isAllowed(env, id) {
  return (env.ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(String(id));
}

async function handleUpdate(env, ctx, update) {
  const cb = update.callback_query;
  if (cb) {
    if (!isAllowed(env, cb.from.id)) return;
    try {
      if (cb.data.startsWith("c:")) await confirmIngest(env, cb);
      else if (cb.data.startsWith("p:")) await confirmPick(env, cb);
      else if (cb.data.startsWith("g:")) await parsePhotoGroup(env, cb);
      else if (cb.data.startsWith("d:")) await confirmDuplicateAnyway(env, cb);
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
  if (!isAllowed(env, message.from.id)) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Это личный архивный бот." });
    return;
  }

  try {
    if (message.location) await handleLocation(env, chatId, message.location);
    else if (message.photo && message.media_group_id) await handlePhotoGroup(env, ctx, chatId, message);
    else if (message.photo) await handlePhoto(env, chatId, message);
    else if (message.document) await handleDocument(env, chatId, message);
    else if (message.text && /^\/(start|help)/.test(message.text)) {
      await tg(env, "sendMessage", { chat_id: chatId, text: HELP });
    } else if (message.text && /^\/log/.test(message.text)) {
      await handleLogCommand(env, chatId);
    } else if (message.text && /https?:\/\//.test(message.text)) {
      const url = message.text.match(/https?:\/\/\S+/)[0];
      await tg(env, "sendMessage", { chat_id: chatId, text: "🔗 Разбираю страницу…" });
      await handleUrl(env, chatId, url);
    } else if (message.text && await handleVenueReply(env, chatId, message.text)) {
      // обработано внутри handleVenueReply — ждали ответ на askForVenue() для этого чата
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
      // Раньше — ctx.waitUntil(handleUpdate(...)) с немедленным "ok": Cloudflare отводит
      // фоновой (post-response) задаче в waitUntil более короткий и НЕ настраиваемый бюджет
      // времени, чем обычному запросу; при его истечении рантайм молча убивает инстанс —
      // ни один try/catch/finally внутри handleUpdate (включая таймаут в claude()) не
      // успевает сработать, потому что убивают саму среду исполнения, а не бросают
      // JS-исключение. Дожидаемся handleUpdate здесь — обычный (не фоновый) запрос получает
      // полный бюджет CPU/времени, и claude()'ный таймаут в 45с реально успевает отработать
      // и отрапортовать ошибку в чат вместо тишины. Компромисс: ответ Telegram'у на вебхук
      // теперь может занимать секунды/десятки секунд вместо мгновенного — в пределах
      // документированного таймаута самого Telegram на вебхуки это не проблема.
      //
      // ИСКЛЮЧЕНИЕ — альбомы (media_group_id): Telegram не присылает следующую страницу,
      // пока не получит ответ на webhook текущей, а разбору альбома нужна пауза в пару
      // секунд, чтобы дождаться всех страниц (см. handlePhotoGroup/finishPhotoGroup) — если
      // бы эта пауза тоже была здесь, под await, каждая страница блокировала бы доставку
      // следующей и ни одна не увидела бы соседей. Поэтому handlePhotoGroup сама выносит
      // паузу+тяжёлый разбор в ctx.waitUntil и возвращается быстро — общий await здесь
      // касается только этого быстрого возврата.
      await handleUpdate(env, ctx, update);
      return new Response("ok");
    }
    return new Response("Йорик bot OK");
  },
};
