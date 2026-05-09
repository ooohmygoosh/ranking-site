const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const store = require('./store');
const { auth, adminOnly, SECRET } = require('./middleware');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/ping', (req, res) => {
  res.json({ message: 'ranking site backend alive' });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  const existing = store.findUserByUsername(username);
  if (existing) return res.status(400).json({ error: '用户名已存在' });
  const user = store.createUser(username, password, false);
  const token = jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.isAdmin },
    SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = store.findUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.isAdmin },
    SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json(req.user);
});

app.get('/api/lists', (req, res) => {
  res.json(store.getAllLists());
});

app.get('/api/lists/:id', (req, res) => {
  const list = store.getListById(req.params.id);
  if (!list) return res.status(404).json({ error: '榜单未找到' });
  res.json(list);
});

app.post('/api/lists', auth, adminOnly, (req, res) => {
  const { title, description, coverImageUrl, items } = req.body;
  if (!title) return res.status(400).json({ error: '标题必填' });
  const list = store.createList({ title, description, coverImageUrl, items });
  res.json(list);
});

app.put('/api/lists/:id', auth, adminOnly, (req, res) => {
  const list = store.updateList(req.params.id, req.body);
  if (!list) return res.status(404).json({ error: '榜单未找到' });
  res.json(list);
});

app.get('/api/lists/:id/summary', auth, (req, res) => {
  const summary = store.getListSummary(req.params.id);
  if (!summary) return res.status(404).json({ error: '榜单未找到' });
  res.json(summary);
});

app.post('/api/lists/:id/submissions', auth, (req, res) => {
  const submission = store.createSubmission(req.params.id, req.body, req.user);
  if (!submission) return res.status(404).json({ error: '榜单未找到' });
  res.json(submission);
});

app.post('/api/lists/:id/candidates', auth, (req, res) => {
  const { name, imageUrl, tierIndex } = req.body;
  if (!Number.isFinite(Number(tierIndex))) {
    return res.status(400).json({ error: '目标档位必填' });
  }
  if (!String(name || imageUrl || '').trim()) {
    return res.status(400).json({ error: '候选内容不能为空' });
  }
  const candidate = store.createCandidate(req.params.id, { name, imageUrl, tierIndex }, req.user);
  if (!candidate) return res.status(404).json({ error: '榜单未找到' });
  res.json(candidate);
});

app.post('/api/candidates/:id/support', auth, (req, res) => {
  const candidate = store.supportCandidate(req.params.id, req.user);
  if (!candidate) return res.status(404).json({ error: '候选项未找到' });
  res.json(candidate);
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Ranking backend listening on http://localhost:${port}`);
});
