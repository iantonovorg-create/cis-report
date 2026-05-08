const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ensure data dir exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

function readDB() {
  if (!fs.existsSync(DB_FILE)) return { employees: [], meetings: [] };
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// GET all data
app.get('/api/data', (req, res) => {
  res.json(readDB());
});

// SAVE employee (add or update)
app.post('/api/employee', (req, res) => {
  const db = readDB();
  const emp = req.body;
  if (!emp.id) emp.id = Date.now().toString();
  const idx = db.employees.findIndex(e => e.id === emp.id);
  if (idx >= 0) db.employees[idx] = emp;
  else db.employees.push(emp);
  writeDB(db);
  res.json({ ok: true, employee: emp });
});

// DELETE employee
app.delete('/api/employee/:id', (req, res) => {
  const db = readDB();
  db.employees = db.employees.filter(e => e.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// SAVE meeting
app.post('/api/meeting', (req, res) => {
  const db = readDB();
  const m = req.body;
  if (!m.id) m.id = Date.now().toString();
  const idx = db.meetings.findIndex(x => x.id === m.id);
  if (idx >= 0) db.meetings[idx] = m;
  else db.meetings.push(m);
  writeDB(db);
  res.json({ ok: true, meeting: m });
});

// DELETE meeting
app.delete('/api/meeting/:id', (req, res) => {
  const db = readDB();
  db.meetings = db.meetings.filter(m => m.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`CIS Dashboard on port ${PORT}`));
