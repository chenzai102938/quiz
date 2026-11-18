/**
 * 孩子性格底色测评 - 后端服务
 * 职责：密码校验、次数控制、静态文件托管
 * 数据存储：data/passwords.json（每个密码记录 used 已用次数 / max 总次数）
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'passwords.json');

// 会话表：sessionId -> { code, createdAt }
// 仅存内存，服务重启后失效（用户重新输入密码即可，不影响密码次数）
const sessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadPasswords() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('读取密码数据失败:', e.message);
    return {};
  }
}

function savePasswords(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

// 校验密码并开启一次测评（消耗一次次数）
app.post('/api/start', (req, res) => {
  const code = normalizeCode(req.body.password);
  if (!code) return res.status(400).json({ error: '请输入密码' });

  const data = loadPasswords();
  const record = data[code];
  if (!record) return res.status(400).json({ error: '密码无效，请检查后重新输入' });
  if (record.used >= record.max) {
    return res.status(403).json({ error: '该密码的 3 次测评机会已用完，请联系客服购买新密码' });
  }

  record.used += 1;
  savePasswords(data);

  const sessionId = require('crypto').randomBytes(16).toString('hex');
  sessions.set(sessionId, { code, createdAt: Date.now() });

  res.json({ sessionId, remaining: record.max - record.used });
});

// 再测一次：复用同一密码，再消耗一次次数
app.post('/api/again', (req, res) => {
  const session = sessions.get(req.body.sessionId);
  if (!session) return res.status(404).json({ error: '会话已失效，请重新输入密码' });

  const data = loadPasswords();
  const record = data[session.code];
  if (!record) return res.status(400).json({ error: '密码记录不存在，请联系客服' });
  if (record.used >= record.max) {
    return res.status(403).json({ error: '该密码的 3 次测评机会已用完，请联系客服购买新密码' });
  }

  record.used += 1;
  savePasswords(data);
  res.json({ remaining: record.max - record.used });
});

// 查询会话状态（刷新页面时恢复剩余次数）
app.post('/api/session', (req, res) => {
  const session = sessions.get(req.body.sessionId);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  const record = loadPasswords()[session.code];
  res.json({ remaining: record ? Math.max(0, record.max - record.used) : 0 });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`测评网站已启动：http://localhost:${PORT}`);
});
