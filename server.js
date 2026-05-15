const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Начальный список доступов
const INITIAL_USERS = [
  { email: 'i.antonov.org@kodland.org',       role: 'admin'  },
  { email: 'natali.evstigneeva@kodland.team', role: 'editor' },
  { email: 't.bushmanova@kodland.team',        role: 'editor' },
  { email: 'v.nemezhanskaya@kodland.org',      role: 'viewer' },
  { email: 'k.abduganieva@kodland.team', role: 'reviews_editor' },
];

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'cis-2026-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── MIDDLEWARE ───────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.path.startsWith('/api')) return res.status(401).json({ error: 'unauthorized' });
  res.redirect('/');
}
function requireEditor(req, res, next) {
  const r = req.session?.user?.role;
  if (r === 'admin' || r === 'editor') return next();
  res.status(403).json({ error: 'forbidden — viewer only' });
}

function requireReviewsEditor(req, res, next) {
  const r = req.session?.user?.role;
  if (r === 'admin' || r === 'editor' || r === 'reviews_editor') return next();
  res.status(403).json({ error: 'forbidden' });
}
function requireAdmin(req, res, next) {
  if (req.session?.user?.role === 'admin') return next();
  res.status(403).json({ error: 'forbidden — admin only' });
}

// ── INIT DB ──────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, month TEXT, block TEXT, sub TEXT, name TEXT,
    role TEXT, entry TEXT, schedule TEXT, plan TEXT, fact TEXT,
    vacation TEXT, status TEXT, birthdate TEXT, functions TEXT, extra TEXT, comment TEXT,
    dismiss TEXT, city TEXT, tz TEXT, phone TEXT, tg TEXT, birthdate TEXT, salary_base NUMERIC DEFAULT 0, tax_zone TEXT DEFAULT '')`);

  await pool.query(`CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY, month TEXT, name TEXT, date TEXT,
    topic TEXT, tasks TEXT, next TEXT, dyn TEXT, tl TEXT)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS access_users (
    email TEXT PRIMARY KEY, role TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW())`);

  await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  tl TEXT,
  title TEXT,
  priority TEXT,
  deadline TEXT,
  description TEXT,
  progress TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS payroll (
  id TEXT PRIMARY KEY,
  month TEXT,
  employee_id TEXT,
  name TEXT,
  block TEXT,
  sub TEXT,
  salary NUMERIC DEFAULT 0,
  bonus_type TEXT DEFAULT '',
  bonus_clients NUMERIC DEFAULT 0,
  bonus_tickets NUMERIC DEFAULT 0,
  bonus_chats NUMERIC DEFAULT 0,
  new_mot_base NUMERIC DEFAULT 25000,
  new_mot_clients_plan NUMERIC DEFAULT 0,
  new_mot_clients_fact NUMERIC DEFAULT 0,
  new_mot_repeat_plan NUMERIC DEFAULT 0,
  new_mot_repeat_fact NUMERIC DEFAULT 0,
  new_mot_first_plan NUMERIC DEFAULT 0,
  new_mot_first_fact NUMERIC DEFAULT 0,
  extra_bonuses TEXT DEFAULT '[]',
  total NUMERIC DEFAULT 0
)`);

  await pool.query(`CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  date TEXT,
  platform TEXT,
  rating NUMERIC DEFAULT 0,
  positive INTEGER DEFAULT 0,
  negative INTEGER DEFAULT 0,
  comment TEXT DEFAULT ''
)`);
  
  for (const u of INITIAL_USERS) {
    await pool.query(
      `INSERT INTO access_users (email,role) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING`,
      [u.email, u.role]);
  }


  console.log('DB ready');
}

// ── LOGIN PAGE ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session?.user) return res.redirect('/app');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CIS Dashboard — Вход</title>
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600&family=Golos+Text:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Golos Text',sans-serif;background:#181818;color:#e4e2df;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#202020;border:1px solid #363636;border-radius:8px;padding:48px 40px;text-align:center;max-width:380px;width:90%}
.logo{font-family:'Unbounded',sans-serif;font-size:11px;font-weight:700;letter-spacing:4px;color:#c8b89a;margin-bottom:32px}
h1{font-family:'Unbounded',sans-serif;font-size:18px;font-weight:600;color:#d4c4a8;margin-bottom:8px}
p{font-size:12px;color:#888;margin-bottom:32px;line-height:1.6}
.btn{display:flex;align-items:center;justify-content:center;gap:12px;background:#fff;color:#333;border:none;border-radius:4px;padding:13px 20px;font-family:'Golos Text',sans-serif;font-size:14px;font-weight:500;cursor:pointer;width:100%;transition:opacity .2s}
.btn:hover{opacity:.9}
.err{color:#c87a7a;font-size:12px;margin-top:16px;display:none;padding:10px;background:rgba(200,122,122,.1);border-radius:4px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">CIS CS</div>
  <h1>Отчёт по команде</h1>
  <p>Войди через корпоративный Google аккаунт чтобы получить доступ к отчёту</p>
  <button class="btn" onclick="signIn()">
    <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.7 2.5 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 6.9-10 6.9-17z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.7 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2 1.4-4.6 2.2-7.7 2.2-6.2 0-11.5-4.2-13.4-9.8l-7.8 6C6.5 42.5 14.6 48 24 48z"/></svg>
    Войти через Google
  </button>
  <div class="err" id="err">Доступ запрещён. Обратитесь к администратору: i.antonov.org@kodland.org</div>
</div>
<script src="https://accounts.google.com/gsi/client" async></script>
<script>
function signIn(){
  const client=google.accounts.oauth2.initTokenClient({
    client_id:'${clientId}',
    scope:'email profile',
    callback:async(resp)=>{
      if(resp.error)return;
      const r=await fetch('/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({access_token:resp.access_token})});
      const d=await r.json();
      if(d.ok)window.location.href='/app';
      else{document.getElementById('err').style.display='block';}
    }
  });
  client.requestAccessToken();
}
</script>
</body></html>`);
});

// ── GOOGLE AUTH ──────────────────────────────────────────────────────────────
app.post('/auth/google', async (req, res) => {
  try {
    const { access_token } = req.body;
    const resp = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${access_token}`);
    const info = await resp.json();
    const email = (info.email || '').toLowerCase();
    if (!email) return res.json({ ok: false });

    const { rows } = await pool.query('SELECT * FROM access_users WHERE email=$1', [email]);
    if (!rows.length) return res.json({ ok: false, error: 'no access' });

    req.session.user = { email, name: info.name, picture: info.picture, role: rows[0].role };
    res.json({ ok: true, role: rows[0].role });
  } catch(e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/auth/me', requireAuth, (req, res) => res.json(req.session.user));

// ── APP ──────────────────────────────────────────────────────────────────────
app.get('/app', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── API: DATA ────────────────────────────────────────────────────────────────
app.get('/api/data', requireAuth, async (req, res) => {
  try {
    const [emp, meet] = await Promise.all([
      pool.query('SELECT * FROM employees ORDER BY month,block,name'),
      pool.query('SELECT * FROM meetings ORDER BY month,date')
    ]);
    res.json({ employees: emp.rows, meetings: meet.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employee', requireAuth, requireEditor, async (req, res) => {
  try {
    const e = req.body;
    if (!e.id) e.id = Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    await pool.query(
      `INSERT INTO employees (id,month,block,sub,name,role,entry,schedule,plan,fact,vacation,status,functions,extra,comment,dismiss,city,tz,phone,tg,birthdate,salary_base,tax_zone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (id) DO UPDATE SET month=$2,block=$3,sub=$4,name=$5,role=$6,entry=$7,schedule=$8,plan=$9,fact=$10,vacation=$11,status=$12,functions=$13,extra=$14,comment=$15,dismiss=$16,city=$17,tz=$18,phone=$19,tg=$20,birthdate=$21,salary_base=$22,tax_zone=$23`,
      [e.id,e.month,e.block,e.sub||'',e.name,e.role||'',e.entry||'',e.schedule||'',e.plan||'',e.fact||'',e.vacation||'',e.status||'',e.functions||'',e.extra||'',e.comment||'',e.dismiss||'',e.city||'',e.tz||'',e.phone||'',e.tg||'',e.birthdate||'',parseFloat(e.salary_base)||0,e.tax_zone||'']);
    res.json({ ok: true, id: e.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/employee/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    await pool.query('DELETE FROM employees WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/meeting', requireAuth, requireEditor, async (req, res) => {
  try {
    const m = req.body;
    if (!m.id) m.id = Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    await pool.query(
      `INSERT INTO meetings (id,month,name,date,topic,tasks,next,dyn,tl)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET month=$2,name=$3,date=$4,topic=$5,tasks=$6,next=$7,dyn=$8,tl=$9`,
      [m.id,m.month,m.name||'',m.date||'',m.topic||'',m.tasks||'',m.next||'',m.dyn||'',m.tl||'']);
    res.json({ ok: true, id: m.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/meeting/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    await pool.query('DELETE FROM meetings WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: УПРАВЛЕНИЕ ДОСТУПАМИ (только admin) ─────────────────────────────────
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM access_users ORDER BY role,email');
  res.json(rows);
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) return res.status(400).json({ error: 'нужны email и role' });
    await pool.query(
      `INSERT INTO access_users (email,role) VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET role=$2`,
      [email.toLowerCase().trim(), role]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:email', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM access_users WHERE email=$1', [decodeURIComponent(req.params.email)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SEED ─────────────────────────────────────────────────────────────────────
async function seedData() {
  const emps = [
    ['h1','Май 2026','HEAD','','Антонов Иван Дмитриевич','Head · Client Service','14.10.2025','09:00–18:00','22','','','','','','','','Будва, Черногория','−1 ч','79933438590','@johnyyq'],
    ['tb1','Май 2026','TL_BUSH','','Бушманова Татьяна Михайловна','Team Lead · КРМ + ТХП','01.02.2021','14:00–22:00','','','','','','','','','Череповец, РФ','нет','79291424416','@bushmanovatm'],
    ['te1','Май 2026','TL_EVS','','Евстигнеева Наталья Валерьевна','Team Lead · КМ','13.09.2022','09:00–16:00','','','','','','','','','Саратов, РФ','+1 ч','+79198396208','@NatalyaEvs'],
    ['o1','Май 2026','OPS','OPS','Володина Наталья Евгеньевна','Operations','17.12.2025','09:00–18:00','22','','','Стабилен','Операционная работа, выгрузки','Документооборот','','','Новосибирск, РФ','+4 ч','+79960721668','@skov_plv'],
    ['o2','Май 2026','OPS','OPS','Гороховская Анна Викторовна','Operations','01.04.2026','10:00–19:00','19','','25.03–05.04','Требует наблюдения','Операционная работа, выгрузки','Работа с КРМ','Перевод из ОКК','','Оренбург, РФ','+2 ч','79958377155','@Anna_Viktorovna09'],
    ['b1','Май 2026','КРМ/ТХП','КРМ','Коритич Марина Александровна','Crisis manager','01.07.2025','9:00–18:00','','','','Увольнение','—','','Ищет новое место, увольнение 14 числа','14.04','Александров, РФ','нет','79066119339','@Marina_Korititch'],
    ['b2','Май 2026','КРМ/ТХП','КРМ','Кроха Никита Сергеевич','Crisis manager (стажёр)','17.03.2026','9:00–18:00','','','','Требует наблюдения','','','ИС на апрель, таргет 70%','','Самара, РФ','+1 ч','799948423','@kroxiik'],
    ['b3','Май 2026','КРМ/ТХП','ТХП','Свинин Николай','Senior TSP','-','12:00–21:00','15','','','Стабилен','','Контроль команды, ФОТ','Старший в ТХП','','-','-','-','-'],
    ['b4','Май 2026','КРМ/ТХП','ТХП','Сорокин Олег','TSP','-','14:00–20:00','22','','','Зона риска','','','Нет действий в омни','','-','-','-','-'],
    ['b5','Май 2026','КРМ/ТХП','ТХП','Павленко Сергей','TSP','-','?','8','','','Требует наблюдения','','','Только на группах — парт-тайм','','-','-','-','-'],
    ['b6','Май 2026','КРМ/ТХП','ТХП','Воронов Александр','TSP','-','14:00–20:00','15','','','Требует наблюдения','','','Вопрос по закрытию задач','','-','-','-','-'],
    ['b7','Май 2026','КРМ/ТХП','ТХП','Бойправ Андрей','TSP','-','?','8','','','Стабилен','','','Парт-тайм сб/вс','','-','-','-','-'],
    ['e1','Май 2026','КМ','Team 1','Минеева Анна Игоревна','Client manager','17.03.2025','14-22/8-16(2)','22','','','Стабилен','НД + постановка групп','Надбавка 2к','','','Волгодонск, РФ','нет','+79885562650','@SProsha'],
    ['e2','Май 2026','КМ','Team 1','Чуракова Надежда Константиновна','Client manager','12.09.2023','08:00–16:00','22','','','Стабилен','ВР — сбор оплат + тикеты','','Низкий показатель','','Бали, Индонезия','+5 ч','79187021374','nadiy_12'],
    ['e3','Май 2026','КМ','Team 1','Божинская Татьяна Васильевна','Client manager','20.03.2024','09:00–18:00','22','','','Зона риска','Работа с 0У + тикеты','','Деструктивная, ищем замену','','Токмок, Кыргызстан','+3 ч','+996555768522','Tati Anna'],
    ['e4','Май 2026','КМ','Team 1','Лихачёва Евгения','Client manager','15.10.2025','09:00–21:00','8','','01.04–14.04.2026','Увольнение','','','Увольнение по семейным','30.04.2026','Рязань, РФ','нет','79209591518','@evgeniyalih'],
    ['e5','Май 2026','КМ','Team 1','Сальменов Ардак Мейрамович','Client manager','23.01.2026','09:00–21:00','15','','','Стабилен','','','Первый месяц на фул ставке','','Павлодар, Казахстан','+2 ч','87021576509','@AS71821'],
    ['e6','Май 2026','КМ','Team 1','Макулик Маргарита','Client manager','14.02.2026','09:00–21:00','15','','','Требует наблюдения','','','','','Беларусь','нет','-','@margo_Mako'],
    ['e7','Май 2026','КМ','Team 1','Панькова Диана','Client manager','20.02.2026','09:00–21:00','15','','','Требует наблюдения','','','','','Беларусь, Бобруйск','нет','375295605407','@di_vic13'],
    ['e8','Май 2026','КМ','Team 1','Агреско Алеся','Client manager','23.02.2026','09:00–21:00','15','','','Требует наблюдения','','','','','Грузия, Тбилиси','+1 ч','995599505574','@agresko'],
    ['e9','Май 2026','КМ','Team 1','Дехрярук Юлия','Client manager (стажёр)','09.03.2026','09:00–18:00','22','','','Требует наблюдения','','','','','-','-','-','-'],
    ['e10','Май 2026','КМ','Team 1','Кокин Пётр','Client manager (стажёр)','12.03.2026','09:00–18:00','22','','','Требует наблюдения','','','','','-','-','-','-'],
    ['e11','Май 2026','КМ','Team 1','Войшев Евгений Владимирович','Chat manager','24.07.2024','09:00–21:00','15','','','Требует наблюдения','','','—','','Термез, Узбекистан','+2 ч','+998996761541','@Evgen9394'],
    ['e12','Май 2026','КМ','Team 1','Ковалевич Анна','Chat manager','15.10.2025','09:00–21:00','15','','','Стабилен','','','ФГ на новую мотивацию','','Минск, РБ','нет','375445498904','@nneonya'],
    ['e13','Май 2026','КМ','Team 2','Абдуганиева Камола Витальевна','Client manager','02.11.2021','9:00–21:00','7','','14.04–27.04.2026','Потенциал роста','SMM — соц. сети','3к+1к за лидов','ФГ по паузам','','Ташкент, Узбекистан','+2 ч','+998949147896','@GuitarCam'],
    ['e14','Май 2026','КМ','Team 2','Оганнесян Ануш Лёвовна','Client manager','23.03.2024','9:00–18:00','22','','','Стабилен','ВР — сбор оплат','','Высокие зарплатные ожидания','','РФ','нет','+79964316007','@annn1911'],
    ['e15','Май 2026','КМ','Team 2','Чекан Елена','Client manager','11.07.2024','8-17/13-22(1)','22','','','Стабилен','Работа с 0У + тикеты','','','','Бишкек, Кыргызстан','+3 ч','+79026588366','@Len_chek1405'],
    ['e16','Май 2026','КМ','Team 2','Жуманова Аружан Нуржановна','Client manager','25.07.2024','9:00–18:00','22','','','Требует наблюдения','Тест новой мотивации','','','','Астана, Казахстан','+2 ч','+77783006199','@arrukazhan'],
    ['e17','Май 2026','КМ','Team 2','Бурова Марина Владимировна','Client manager','28.09.2024','9-18/12-21(2)','21','','','Стабилен','ВР — сбор оплат','','','','Киров, РФ','нет','79960466193','@marii954'],
    ['e18','Май 2026','КМ','Team 2','Евзрезова Виктория','Client manager','25.06.2025','12:00–21:00','19','','28.04–04.05.2026','Требует наблюдения','Работа с 0У','','','','Минск, РБ','нет','+375445896603','@tavimii'],
    ['e19','Май 2026','КМ','Team 2','Хлуднева Анна Александровна','Client manager','27.06.2025','08:00–16:00','18','','','Требует наблюдения','','','','','Новосибирск, РФ','+4 ч','+79139123316','@topasik1'],
    ['e20','Май 2026','КМ','Team 2','Суханова Татьяна Михайловна','Client manager','05.09.2024','9-17/9-18(1)','22','','','Стабилен','Тест новой мотивации','','ФГ на новую мотивацию','','Магнитогорск, РФ','+2 ч','79525144954','@reallynotspecial']
  ];
  for (const e of emps) {
    await pool.query(
      `INSERT INTO employees (id,month,block,sub,name,role,entry,schedule,plan,fact,vacation,status,functions,extra,comment,dismiss,city,tz,phone,tg)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) ON CONFLICT (id) DO NOTHING`, e);
  }
  console.log('Seed done');
}

// ── API: TASKS ───────────────────────────────────────────────────────────────
app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/task', requireAuth, requireEditor, async (req, res) => {
  try {
    const t = req.body;
    if (!t.id) t.id = Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    await pool.query(
      `INSERT INTO tasks (id,tl,title,priority,deadline,description,progress,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (id) DO UPDATE SET tl=$2,title=$3,priority=$4,deadline=$5,description=$6,progress=$7`,
      [t.id,t.tl||'',t.title||'',t.priority||'Средний',t.deadline||'',t.description||'',t.progress||'0']);
    res.json({ ok: true, id: t.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/task/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: PAYROLL ─────────────────────────────────────────────────────────────
app.get('/api/payroll', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM payroll ORDER BY block, sub, name');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payroll', requireAuth, requireEditor, async (req, res) => {
  try {
    const p = req.body;
    if (!p.id) p.id = Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    await pool.query(
      `INSERT INTO payroll (id,month,employee_id,name,block,sub,salary,bonus_type,
        bonus_clients,bonus_tickets,bonus_chats,
        new_mot_base,new_mot_clients_plan,new_mot_clients_fact,
        new_mot_repeat_plan,new_mot_repeat_fact,
        new_mot_first_plan,new_mot_first_fact,
        extra_bonuses,total,plan_days,fact_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (id) DO UPDATE SET
         month=$2,employee_id=$3,name=$4,block=$5,sub=$6,salary=$7,bonus_type=$8,
         bonus_clients=$9,bonus_tickets=$10,bonus_chats=$11,
         new_mot_base=$12,new_mot_clients_plan=$13,new_mot_clients_fact=$14,
         new_mot_repeat_plan=$15,new_mot_repeat_fact=$16,
         new_mot_first_plan=$17,new_mot_first_fact=$18,
         extra_bonuses=$19,total=$20,plan_days=$21,fact_days=$22`,
      [p.id,p.month,p.employee_id||'',p.name,p.block,p.sub||'',
       p.salary||0,p.bonus_type||'',
       p.bonus_clients||0,p.bonus_tickets||0,p.bonus_chats||0,
       p.new_mot_base||25000,p.new_mot_clients_plan||0,p.new_mot_clients_fact||0,
       p.new_mot_repeat_plan||0,p.new_mot_repeat_fact||0,
       p.new_mot_first_plan||0,p.new_mot_first_fact||0,
       JSON.stringify(p.extra_bonuses||[]),p.total||0,parseFloat(p.plan_days)||0,parseFloat(p.fact_days)||0]);
    res.json({ ok: true, id: p.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/payroll/:id', requireAuth, requireEditor, async (req, res) => {
  try {
    await pool.query('DELETE FROM payroll WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: REVIEWS ─────────────────────────────────────────────────────────────
app.get('/api/reviews', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM reviews ORDER BY date DESC');
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/review', requireAuth, requireReviewsEditor, async (req, res) => {
  try {
    const r = req.body;
    if (!r.id) r.id = Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    await pool.query(
      `INSERT INTO reviews (id,date,platform,rating,positive,negative,comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET date=$2,platform=$3,rating=$4,positive=$5,negative=$6,comment=$7`,
      [r.id,r.date,r.platform,r.rating||0,r.positive||0,r.negative||0,r.comment||'']);
    res.json({ ok: true, id: r.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/review/:id', requireAuth, requireReviewsEditor, async (req, res) => {
  try {
    await pool.query('DELETE FROM reviews WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.redirect('/'));

initDB().then(() => {
  app.listen(PORT, () => console.log(`CIS Dashboard on port ${PORT}`));
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
