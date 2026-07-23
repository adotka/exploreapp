/**
 * MindHorizon Telegram bot — Cloudflare Worker (V2, автоматический разбор).
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
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.MODEL || "claude-opus-4-8",
      max_tokens: maxTokens,
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
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

const EVENT_PICK_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["found", "url", "title", "scene", "time"],
  properties: {
    found: { type: "boolean" }, url: { type: "string" },
    title: { type: "string" }, scene: { type: "string" }, time: { type: "string" },
  },
};

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

## Составы

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
  return resp.headers.get("content-type")?.includes("json") ? resp.json() : resp.text();
}

async function getRawFile(env, path) {
  return gh(env, `/contents/${path}?ref=main`, { headers: { Accept: "application/vnd.github.raw+json" } });
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
    p.cast && p.cast.length ? `Составы: ${p.cast.map((c) => `${c.role} — ${c.names.join(", ")}`).slice(0, 6).join("; ")}` : "",
  ].filter(Boolean);
  if (known.length) {
    lines.push("", "👀 <b>Вы уже встречали:</b>", ...known);
  }
  return lines.join("\n");
}

async function proposeIngest(env, chatId, parsed, sourceUrl, photo) {
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
  await env.PENDING.put(key, JSON.stringify({ parsed, sourceUrl, photo }), { expirationTtl: 86400 });
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
  const { parsed: p, sourceUrl, photo } = JSON.parse(raw);
  const fileName = `${p.date}_${theatreSlug(p.theatre)}_${slugify(p.title)}.md`;
  let playbillPath = "";
  const files = [];
  if (photo) {
    playbillPath = `playbills/${p.date}_${theatreSlug(p.theatre)}_${slugify(p.title)}.jpg`;
    files.push({ path: playbillPath, base64: photo });
  }
  files.push({ path: `items/${fileName}`, content: renderItem(p, sourceUrl, playbillPath) });
  const inv = await getRawFile(env, "inventory/performances.md");
  files.push({ path: "inventory/performances.md", content: insertInventoryRow(inv, p, fileName) });
  await commitFiles(env, files, `bot: ingest ${p.title} (${p.date})\n\nПодтверждено оператором в Telegram.`);
  await env.PENDING.delete(key);
  await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Добавлено ✅" });
  await tg(env, "editMessageText", {
    chat_id: cb.message.chat.id, message_id: cb.message.message_id,
    text: `✅ Добавлено: ${p.title} (${p.date}).\nСайт пересоберётся через ~1 мин: ${env.SITE_URL}/`,
  });
}

async function handleLocation(env, chatId, loc) {
  const venue = nearestVenue(loc.latitude, loc.longitude);
  if (!venue) {
    await tg(env, "sendMessage", { chat_id: chatId, text: "Рядом нет известных театров (пока знаю только Мариинский). Пришлите ссылку или скан программки." });
    return;
  }
  const now = new Date(Date.now() + 3 * 3600e3); // Мск/СПб = UTC+3
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1, d = now.getUTCDate();
  const hhmm = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
  await tg(env, "sendMessage", { chat_id: chatId, text: `📍 Похоже, вы в: ${venue.theatre} (${venue.scene}). Ищу, что идёт сегодня…` });
  const dayUrl = `https://www.mariinsky.ru/playbill/playbill/${y}/${m}/${d}/`;
  const dayHtml = stripHtml(await (await fetch(dayUrl)).text());
  const pick = await claude(env, [{
    type: "text",
    text: `Афиша Мариинского театра на сегодня (${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}), сейчас ${hhmm}. Зритель находится в здании: ${venue.scene}. Найди спектакль, который идёт сейчас или начинается ближайшим на этой сцене. Верни absolute url страницы события (вида https://www.mariinsky.ru/playbill/playbill/ГГГГ/М/Д/<сцена>_<ЧЧММ>/), название, сцену, время. Если ничего нет — found=false.\n\nТекст афиши:\n${dayHtml}`,
  }], EVENT_PICK_SCHEMA, 2048);
  if (!pick.found || !pick.url) {
    await tg(env, "sendMessage", { chat_id: chatId, text: `Не нашёл идущий сейчас спектакль в «${venue.scene}». Пришлите ссылку на событие вручную.` });
    return;
  }
  await tg(env, "sendMessage", { chat_id: chatId, text: `🎭 Сейчас: ${pick.title} (${pick.scene || venue.scene}, ${pick.time}). Разбираю программку…` });
  await handleUrl(env, chatId, pick.url);
}

async function handleUrl(env, chatId, url) {
  const pageText = stripHtml(await (await fetch(url)).text());
  const parsed = await claude(env, [{
    type: "text",
    text: `${PARSE_PROMPT}\n\nURL страницы: ${url}\n\nТекст страницы:\n${pageText}`,
  }], PERF_SCHEMA);
  await proposeIngest(env, chatId, parsed, url, null);
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
  await proposeIngest(env, chatId, parsed, "", b64);
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
  await proposeIngest(env, chatId, parsed, "", doc.mime_type === "application/pdf" ? null : b64);
}

const HELP = `Я — бот архива MindHorizon. Присылайте:
• 📷 фото/скан программки (или PDF)
• 🔗 ссылку на страницу спектакля (mariinsky.ru и др.)
• 📝 свободный текст с описанием спектакля
• 📍 геолокацию из театра — угадаю, что вы сейчас смотрите
Каждый разбор я показываю на подтверждение перед записью в архив.`;

async function handleUpdate(env, update) {
  const cb = update.callback_query;
  if (cb) {
    if (String(cb.from.id) !== String(env.OPERATOR_CHAT_ID)) return;
    if (cb.data.startsWith("c:")) await confirmIngest(env, cb);
    else if (cb.data.startsWith("x:")) {
      await env.PENDING.delete(cb.data.slice(2));
      await tg(env, "answerCallbackQuery", { callback_query_id: cb.id, text: "Отменено" });
      await tg(env, "editMessageText", {
        chat_id: cb.message.chat.id, message_id: cb.message.message_id, text: "❌ Отменено.",
      });
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
    else if (message.photo) await handlePhoto(env, chatId, message);
    else if (message.document) await handleDocument(env, chatId, message);
    else if (message.text && /^\/(start|help)/.test(message.text)) {
      await tg(env, "sendMessage", { chat_id: chatId, text: HELP });
    } else if (message.text && /https?:\/\//.test(message.text)) {
      const url = message.text.match(/https?:\/\/\S+/)[0];
      await tg(env, "sendMessage", { chat_id: chatId, text: "🔗 Разбираю страницу…" });
      await handleUrl(env, chatId, url);
    } else if (message.text) {
      const parsed = await claude(env, [
        { type: "text", text: `${PARSE_PROMPT}\n\nОписание от зрителя:\n${message.text}` },
      ], PERF_SCHEMA);
      await proposeIngest(env, chatId, parsed, "", null);
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
    return new Response("MindHorizon bot OK");
  },
};
