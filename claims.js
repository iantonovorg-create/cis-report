// ── ДОСУДЕБНЫЕ ПРЕТЕНЗИИ: чтение таблицы «возвраты | CIS» и разбор ──────────────
// Читает одну вкладку Google-таблицы (по gid) сервисным аккаунтом GOOGLE_CREDENTIALS.
// Таблицу нужно расшарить на email сервисного аккаунта (права «Читатель»).
// Только чтение: в таблицу ничего не пишется.

const SHEET_ID = process.env.REFUNDS_SHEET_ID || '1i43kOjCEFotdv9dx9PRHkaezE9BCTYPDclYkhku5Ns8';
const SHEET_GID = Number(process.env.REFUNDS_SHEET_GID || 716528261);
const CACHE_MS = 10 * 60 * 1000;   // кэш 10 минут
const FORCE_MIN_MS = 60 * 1000;    // «Обновить» не чаще раза в минуту

const MONTHS = { 'январь':'01','февраль':'02','март':'03','апрель':'04','май':'05','июнь':'06','июль':'07','август':'08','сентябрь':'09','октябрь':'10','ноябрь':'11','декабрь':'12' };

const T_OFFER = 'Несогласие с расчётом по оферте';
const T_SERVICE = 'Ошибка сервиса КС';
const T_PRODUCT = 'Ошибка продукта (смена программы)';
const T_DIRECT = 'Сразу претензия (личные причины)';
const T_PREVENT = 'Превентивно (риск претензии)';

// Ручная разметка (краткая причина / суть / триггер) по ID запроса в БО.
// Для новых строк всё определяется автоматически по тексту; сюда можно дописывать уточнения.
const OVERRIDES = {
  'c7fa223d-0040-4007-bbdb-ef4173cea939': [T_OFFER, 'Передумали, нет времени (много допзанятий)', 'Согласовали 1-й урок как пробный, не пришли. Расчёт с удержанием предобучения → досудебка, вернули 100%.'],
  '27fdb4a7-cc42-43e2-a792-5b96fb4dbf61': [T_DIRECT, 'Развод родителей', 'Возражение нерешаемое, сразу заявление-досудебка. Вернули 1 006 € (~93% покупки).'],
  '55b836bc-623d-427e-a520-b9a1cc1f63b0': [T_DIRECT, 'Причину не назвали, на связь не вышли', 'Претензия пришла до диалога. Ответ направлен, вернули 54 600 ₽.'],
  '9edba802-6710-4a33-9b34-02228771ac23': [T_OFFER, 'Нет интереса к IT, подготовка к ЕГЭ', 'Расчёт на почту + предложение Unity → досудебка. Вернули 31 840 ₽.'],
  '583bac66-fee4-49b7-95e6-015c820dba2d': [T_OFFER, 'Нет времени: 10 класс, подготовка к вузу', 'Пауза и смена курса не сработали; после расчёта угрозы судом → возврат не по оферте 100 800 ₽.'],
  '956a4471-d849-4e28-86b1-9258ae31f915': [T_PREVENT, 'Кадетская школа + финансовые трудности', 'Клиент в негативе; провели как досудебку без удержаний, 41 520 ₽.'],
  'a6b0e7cd-9f70-48ab-8d0d-339685f082f6': [T_OFFER, 'Сменились интересы ребёнка', 'Расчёт и альтернативы маме → претензия. К возврату 30 345 ₽.'],
  'f5a82d46-44d8-4da0-b369-0c139a65aa90': [T_SERVICE, 'КС не связались после заморозки', 'Ранее удержан; 1-1 без перерасчёта — отказ. Вернули 14 726 ₽.'],
  '0f9c0e88-24f7-4385-8245-2e147244c9c0': [T_SERVICE, 'Игнор сообщений, не подобрали группу на обещанное время', 'Диспут в Stripe до первого урока; от 1-1 отказ. Вернули 74 630 ₽ (~98%).'],
  '5c5af0d1-b7b4-4b9f-853d-a937bc6d7320': [T_SERVICE, 'Не перезвонили в нужный день, игнор', 'Ранее удержан, решали тех. проблемы; претензия → возврат 16 617 ₽.'],
  'c38075da-b21b-451b-8de8-9e30834437a4': [T_OFFER, 'Болезнь и пропуски, не понравилась программа', 'Ранее удержан; ушли в другую школу, угрозы судом. Вернули за вычетом уроков (21 000 ₸).'],
  '3518834c-b8cf-46d8-820f-96c1fe194c23': [T_DIRECT, 'Серьёзные семейные обстоятельства (не озвучены)', 'Заморозка, передача, математика — отказ. Заявление, вернули 95 000 ₽ (100%).'],
  '58119b00-6884-4fe5-8a81-fd7f53f9156e': [T_PRODUCT, 'Сменили программу курса без предупреждения', 'Угроза претензией; не обостряли, перевели на другой курс — клиент сохранён.'],
  '817bd496-fdcd-4faa-ad7a-56f43c35d6b6': [T_OFFER, 'Перегрузка: ребёнок учится в 2 школах', 'Попытка по оферте → угроза суда, сразу уступили. Вернули 156 €.'],
};

const RX_THREAT = /угроз\S*\s+(суд\S*|претенз\S*)|упомина\S*\s+суд|грози\S*\s+суд|пригрози\S*/i;

function num(v) {
  if (v == null) return null;
  // убираем пробелы, валюту и прочие символы: «1 234,5 ₽» → 1234.5
  let s = String(v).replace(/[^\d,.\-]/g, '');
  if (s === '' || s === '-') return null;
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.'); // 1.234,5
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseDate(v) {
  const t = String(v || '');
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = t.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
function workMonth(v) {
  const m = String(v || '').trim().toLowerCase().match(/^([а-яё]+)\s+(\d{4})/);
  if (!m || !MONTHS[m[1]]) return null;
  return `${m[2]}-${MONTHS[m[1]]}`;
}
function section(text, label) {
  const re = new RegExp(label + '\\s*:?\\s*([\\s\\S]*?)(?:\\n\\s*(?:Итог работы|Причина запроса возврата|Примененные инструменты|Тикет на КС)\\s*:|$)', 'i');
  const m = String(text || '').match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
function short(s, n) { s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

function classify(list, text) {
  const t = (text || '').toLowerCase(), l = (list || '').toLowerCase();
  if (l.includes('жалобы на работу кс') || /игнор|не перезвон|не связал|не подобрал|диспут|chargeback|чарджбек/.test(t)) return T_SERVICE;
  if (/сменил\S* программ|смен\S* программ/.test(t)) return T_PRODUCT;
  if (/превентив|потенциально может быть|лучше проводить как досудеб/.test(t)) return T_PREVENT;
  if (l.includes('удержанием по оферте') || /оферт|расч[её]т|предобуч/.test(t)) return T_OFFER;
  return T_DIRECT;
}

// rows: массив массивов (первая строка — заголовки), как отдаёт Sheets API values.get
function parseRefunds(rows) {
  if (!rows || !rows.length) return { requests: [], claims: [] };
  const head = rows[0].map((h) => String(h || '').trim());
  const col = (name) => head.indexOf(name);
  const C = {
    work: col('Месяц в котором ведется работа'), link: col('Ссылка на запрос в БО'), created: col('Дата создания отчета'),
    refundDate: col('Дата проведения возврата'), bo: col('БО клиента'), krm: col('Ответсвенный КРМ'), krmStatus: col('Статус работы КРМ'),
    status: col('Итоговый статус после проверки (из БО)'), list: col('Причина из списка'), text: col('Причина своими словами'),
    period: col('Период возврата'), main: col('Основная причина'), purchase: col('Сумма всей покупки, RUB'),
    requested: col('Запрошенная сумма, RUB'), payment: col('Способ оплаты'), refundCur: col('Итоговая сумма возврата, CUR'),
    currency: col('Валюта'), refund: col('Итоговая сумма возврата, RUB'),
  };
  const KPI_COL = col('Сумма удержания в KPI, RUB'); // необязательная колонка
  const missing = Object.entries(C).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) throw new Error('В таблице не найдены колонки: ' + missing.join(', '));
  const g = (r, k) => (r[C[k]] == null ? '' : String(r[C[k]]).trim());

  const requests = [], cand = [], skipped = [];
  rows.slice(1).forEach((r, i) => {
    const created = parseDate(g(r, 'created')), wm = workMonth(g(r, 'work'));
    if (!created || !wm) {
      // строка с данными, но без даты создания / месяца работы — не теряем молча
      if (g(r, 'link') || g(r, 'bo') || g(r, 'refund')) skipped.push({ row: i + 2, reason: !created ? 'нет «Дата создания отчета»' : 'не распознан «Месяц в котором ведется работа»: ' + g(r, 'work') });
      return;
    }
    const link = g(r, 'link');
    const id = (link.match(/id=([0-9a-f-]+)/i) || [])[1] || 'row' + (i + 2);
    const status = g(r, 'status');
    const list = g(r, 'list'), text = g(r, 'text');
    const refunded = /^завершен/i.test(status) || /^частично/i.test(status); // «Завершено», «Частично сохранено/удержан»
    const req = {
      id, created, created_month: created.slice(0, 7), work_month: wm, final_status: status, main_reason: g(r, 'main'),
      period: g(r, 'period'), payment: g(r, 'payment'), refund_rub: num(g(r, 'refund')) || 0,
      refunded, refund_fact: refunded ? (num(g(r, 'refund')) || 0) : 0, claim_type: '', segment: 'regular',
      kpi_rub: KPI_COL >= 0 ? (num(r[KPI_COL]) || 0) : 0, krm: g(r, 'krm'), krm_status: g(r, 'krmStatus'),
      refund_date: parseDate(g(r, 'refundDate')), refund_month: refunded ? ((parseDate(g(r, 'refundDate')) || '').slice(0, 7) || 'без даты') : '', purchase_rub: num(g(r, 'purchase')), requested_rub: num(g(r, 'requested')) || 0, currency: g(r, 'currency'),
      bo_request: link, reason: list,
      cause: short(section(text, 'Причина запроса возврата') || list || '', 110),
      essence: short([section(text, 'Примененные инструменты'), section(text, 'Итог работы') && ('Итог: ' + section(text, 'Итог работы'))].filter(Boolean).join(' ') || text, 220),
    };
    requests.push(req);
    const formal = /досудебн\S* претенз/i.test(list);
    const threat = !formal && RX_THREAT.test(text);
    if (formal || threat) cand.push({ req, r, list, text, formal, link });
  });

  // Дубли одного клиента среди досудебок: оставляем одну строку (проведённую, иначе самую позднюю)
  const byClient = new Map();
  for (const c of cand) {
    const key = (c.formal ? 'F' : 'T') + '|' + (g(c.r, 'bo') || c.req.id);
    const arr = byClient.get(key) || []; arr.push(c); byClient.set(key, arr);
  }
  const claims = [];
  for (const arr of byClient.values()) {
    arr.sort((a, b) => (b.req.refunded - a.req.refunded) || b.req.created.localeCompare(a.req.created));
    const keep = arr[0];
    arr.slice(1).forEach((d) => { d.req.claim_type = 'Дубль'; if (d.formal) d.req.segment = 'dup'; });
    const allText = arr.map((x) => x.text).join('\n');
    const ov = OVERRIDES[keep.req.id];
    const cause = ov ? ov[1] : short(section(allText, 'Причина запроса возврата') || keep.list || 'не указана', 110);
    const essence = ov ? ov[2] : short([section(allText, 'Примененные инструменты'), section(allText, 'Итог работы') && ('Итог: ' + section(allText, 'Итог работы'))].filter(Boolean).join(' ') || allText, 220);
    const type = keep.formal ? 'Досудебная претензия' : 'Угроза без претензии';
    keep.req.claim_type = type;
    const trigger = ov ? ov[0] : classify(arr.map((x) => x.list).join(', '), allText);
    if (keep.formal) { keep.req.segment = 'claim'; keep.req.reason = trigger; keep.req.trigger = trigger; }
    keep.req.cause = cause; keep.req.essence = essence;
    claims.push({
      id: keep.req.id, created: keep.req.created, created_month: keep.req.created_month, work_month: keep.req.work_month,
      type, trigger, cause, essence,
      main_reason: keep.req.main_reason, period: keep.req.period, krm_status: g(keep.r, 'krmStatus'), final_status: keep.req.final_status,
      refund_date: parseDate(g(keep.r, 'refundDate')), purchase_rub: num(g(keep.r, 'purchase')), requested_rub: num(g(keep.r, 'requested')),
      refund_rub: num(g(keep.r, 'refund')), refund_fact: keep.req.refunded ? (num(g(keep.r, 'refund')) || 0) : 0, refund_cur: g(keep.r, 'refundCur'), currency: g(keep.r, 'currency'), payment: keep.req.payment,
      krm: g(keep.r, 'krm'), bo_request: keep.link, duplicates: arr.length - 1,
    });
  }
  claims.sort((a, b) => a.created.localeCompare(b.created));
  return { requests, claims, skipped, last_created: requests.reduce((m, r) => (r.created > m ? r.created : m), '') };
}

let cache = null, cacheAt = 0, inflight = null;

// Вариант 1 (основной): Apps Script web app, развёрнутый от имени сотрудника с доступом к таблице.
// CLAIMS_SCRIPT_URL = https://script.google.com/macros/s/.../exec?key=СЕКРЕТ
async function fetchViaScript(url) {
  const fetchFn = typeof fetch === 'function' ? fetch : require('node-fetch');
  const r = await fetchFn(url, { redirect: 'follow' });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch (e) {
    const title = ((text.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
    const body = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    let hint = 'неизвестный ответ';
    if (/accounts\.google\.com|ServiceLogin|Вход|Sign in/i.test(text)) hint = 'Google просит войти — у веб-приложения доступ не «Все» (Anyone)';
    else if (/не найден|not found|Script function not found/i.test(text)) hint = 'не найдена функция doGet — развёрнут не тот проект или старая версия';
    else if (/Exceeded maximum execution time|превышено/i.test(text)) hint = 'скрипт не успел прочитать таблицу за отведённое время';
    else if (/Ошибка|Error|Exception|authoriz|разреш/i.test(text)) hint = 'ошибка внутри скрипта (часто: не выдано разрешение на таблицу — запустите test в редакторе)';
    console.error('Claims Apps Script non-JSON', r.status, r.url, title, body);
    throw new Error(`Apps Script вернул не данные: ${hint}. [HTTP ${r.status}${title ? ', «' + title + '»' : ''}] ${body}`);
  }
  if (j.error) throw new Error('Apps Script: ' + j.error);
  return { tab: j.tab, ...parseRefunds(j.values || []) };
}

async function fetchSheet() {
  const scriptUrl = (process.env.CLAIMS_SCRIPT_URL || '').trim().replace(/^["'«]+|["'»]+$/g, '').replace(/\s+/g, '');
  if (scriptUrl) return fetchViaScript(scriptUrl);
  // Вариант 2: сервисный аккаунт Google
  if (!process.env.GOOGLE_CREDENTIALS) throw new Error('Источник не настроен: добавьте в Render переменную CLAIMS_SCRIPT_URL (ссылка на Apps Script).');
  const { google } = require('googleapis');
  const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth });
  let title;
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties(sheetId,title)' });
    const tab = (meta.data.sheets || []).find((s) => s.properties.sheetId === SHEET_GID);
    if (!tab) throw new Error(`В таблице нет вкладки с gid=${SHEET_GID}.`);
    title = tab.properties.title;
  } catch (e) {
    if (e.code === 403 || e.code === 404) throw new Error(`Нет доступа к таблице возвратов. Расшарьте её на ${creds.client_email} (Читатель).`);
    throw e;
  }
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${title.replace(/'/g, "''")}'!A:AC`, valueRenderOption: 'FORMATTED_VALUE' });
  return { tab: title, ...parseRefunds(res.data.values || []) };
}
async function getClaims(force) {
  const now = Date.now();
  const fresh = cache && now - cacheAt < (force ? FORCE_MIN_MS : CACHE_MS);
  if (fresh) return cache;
  if (!inflight) {
    inflight = fetchSheet().then((d) => { cache = { ...d, updated_at: new Date().toISOString() }; cacheAt = Date.now(); return cache; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

module.exports = { getClaims, parseRefunds, SHEET_ID, SHEET_GID };
