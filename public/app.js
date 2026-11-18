/* ============ 全局状态 ============ */
const DIM_NAMES = { E: '能量水平', R: '情绪反应', A: '趋近适应', P: '坚持规律' };
let sessionId = sessionStorage.getItem('qs_session') || null;
let answers = new Array(QUESTIONS.length).fill(null);
let current = 0;
let lastResult = null;
let isShared = false; // 通过分享链接查看结果

const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
}

function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

function openModal(html) {
  $('modalBody').innerHTML = html;
  $('modal').style.display = 'flex';
}
function closeModal() { $('modal').style.display = 'none'; }

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
    document.body.removeChild(ta);
  });
}

/* ============ 密码门禁 ============ */
// 当前使用的密码（明文存内存 + sessionStorage，供"再测一次"复用）
let currentPassword = sessionStorage.getItem('qs_pwd') || null;

$('startBtn').addEventListener('click', async () => {
  const password = $('passwordInput').value.trim();
  if (!password) return showGateError('请输入密码');
  $('gateError').textContent = '';
  const btn = $('startBtn');
  btn.disabled = true; btn.textContent = '验证中...';
  const data = await SUPA.redeem(password);
  btn.disabled = false; btn.textContent = '开始测评';
  if (!data.ok) return showGateError(data.error || '验证失败，请重试');
  currentPassword = password.toUpperCase();
  sessionStorage.setItem('qs_pwd', currentPassword);
  sessionId = 'supa_' + currentPassword; // 本地会话标识
  sessionStorage.setItem('qs_session', sessionId);
  answers = new Array(QUESTIONS.length).fill(null);
  current = 0;
  saveAnswers();
  showScreen('quiz');
  renderQuestion();
});

function showGateError(msg) { $('gateError').textContent = msg; }
$('passwordInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('startBtn').click(); });

/* ============ 答题流程 ============ */
function saveAnswers() {
  if (sessionId) sessionStorage.setItem('qs_answers_' + sessionId, JSON.stringify(answers));
}
function loadAnswers() {
  if (!sessionId) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem('qs_answers_' + sessionId));
    if (Array.isArray(saved) && saved.length === QUESTIONS.length) answers = saved;
  } catch (e) {}
}

function renderQuestion() {
  const q = QUESTIONS[current];
  $('progressText').textContent = `第 ${current + 1} / ${QUESTIONS.length} 题`;
  $('dimTag').textContent = DIM_NAMES[q.dim];
  $('progressFill').style.width = `${((current + 1) / QUESTIONS.length) * 100}%`;
  $('qNumber').textContent = 'Q' + (current + 1);
  $('qText').textContent = q.text;
  $('options').innerHTML = q.options.map((opt, i) => `
    <div class="option ${answers[current] === i ? 'selected' : ''}" data-index="${i}">
      <div class="option-letter">${'ABCD'[i]}</div>
      <div class="option-text">${escapeHtml(opt)}</div>
    </div>`).join('');
  document.querySelectorAll('.option').forEach(el => {
    el.addEventListener('click', () => {
      answers[current] = parseInt(el.dataset.index, 10);
      saveAnswers();
      renderQuestion();
    });
  });
  $('prevBtn').disabled = current === 0;
  $('nextBtn').textContent = current === QUESTIONS.length - 1 ? '查看结果' : '下一题';
  $('nextBtn').disabled = answers[current] === null;
}

$('prevBtn').addEventListener('click', () => {
  if (current > 0) { current--; renderQuestion(); }
});
$('nextBtn').addEventListener('click', () => {
  if (answers[current] === null) return toast('请先选择一个答案');
  if (current < QUESTIONS.length - 1) { current++; renderQuestion(); return; }
  // 最后一题：校验是否全部作答
  const blank = answers.findIndex(a => a === null);
  if (blank !== -1) {
    current = blank; renderQuestion();
    toast(`还有第 ${blank + 1} 题未作答`);
    return;
  }
  lastResult = computeResult(answers);
  isShared = false;
  saveLastResult();
  renderResult(lastResult);
  showScreen('result');
});

function saveLastResult() {
  if (!lastResult) return;
  sessionStorage.setItem('qs_last_result', JSON.stringify({
    key: lastResult.key, subKey: lastResult.subKey, pct: lastResult.pct
  }));
}

/* ============ 结果页渲染 ============ */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderResult(r) {
  const { result, sub, pct } = r;
  $('rName').textContent = result.name;
  $('rTag').textContent = result.tag;
  $('rHero').textContent = result.hero;
  $('rSub').innerHTML = `副色 · <b>${sub.name}</b> ｜ ${sub.desc}`;

  $('resultBody').innerHTML = `
    <div class="r-section">
      <h3>一眼认出你的孩子</h3>
      <ul class="r-list">${result.recognize.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
    </div>
    <div class="r-section">
      <h3>他不是……</h3>
      <p class="r-para">${escapeHtml(result.not)}</p>
    </div>
    <div class="r-section">
      <h3>气质档案 · 理论依据</h3>
      <p class="r-para">${escapeHtml(result.theory)}</p>
    </div>
    <div class="r-section">
      <h3>养育说明书</h3>
      ${result.guide.map((g, i) => `<div class="r-step"><div class="step-num">${i + 1}</div><div>${escapeHtml(g)}</div></div>`).join('')}
    </div>
    <div class="r-section">
      <h3>最容易踩的坑</h3>
      <div class="r-note">${escapeHtml(result.pitfall)}</div>
    </div>
    <div class="r-section">
      <h3>你会学到的一件事</h3>
      <div class="r-learn">${escapeHtml(result.learn)}</div>
      <p class="muted" style="margin:12px 0 0">养育提示：${escapeHtml(sub.tip)}</p>
    </div>`;

  $('rQuotes').innerHTML = result.quotes.map(q => `<div class="quote-item">${escapeHtml(q)}</div>`).join('');
  $('rMoment').textContent = result.moment;

  // 绘制雷达图
  requestAnimationFrame(() => drawRadar($('radar'), pct, false));
}

/* ============ 雷达图绘制（结果页 + 长图共用）============ */
function drawRadar(canvas, pct, isPoster) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2 + (isPoster ? 0 : 6);
  const r = W * (isPoster ? 0.20 : 0.26);
  const dims = ['E', 'R', 'A', 'P'];
  const labels = isPoster ? ['能量', '情绪', '趋近', '坚持'] : ['能量水平', '情绪反应', '趋近适应', '坚持规律'];
  const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const point = (i, ratio) => [cx + Math.cos(angles[i]) * r * ratio, cy + Math.sin(angles[i]) * r * ratio];

  ctx.clearRect(0, 0, W, H);

  // 网格
  [0.25, 0.5, 0.75, 1].forEach(level => {
    ctx.beginPath();
    dims.forEach((_, i) => { const [x, y] = point(i, level); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.strokeStyle = isPoster ? 'rgba(190,130,95,.28)' : 'rgba(200,130,90,.22)';
    ctx.lineWidth = isPoster ? 2 : 3;
    ctx.stroke();
  });
  // 轴线
  dims.forEach((_, i) => {
    const [x, y] = point(i, 1);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y);
    ctx.strokeStyle = isPoster ? 'rgba(190,130,95,.22)' : 'rgba(200,130,90,.18)';
    ctx.lineWidth = isPoster ? 2 : 2; ctx.stroke();
  });
  // 数据区域
  ctx.beginPath();
  dims.forEach((d, i) => {
    const [x, y] = point(i, Math.max(0.04, pct[d] / 100));
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,138,91,.32)'; ctx.fill();
  ctx.strokeStyle = '#F2703C';
  ctx.lineWidth = isPoster ? 4 : 5;
  ctx.lineJoin = 'round'; ctx.stroke();

  // 顶点
  dims.forEach((d, i) => {
    const [x, y] = point(i, Math.max(0.04, pct[d] / 100));
    ctx.beginPath(); ctx.arc(x, y, isPoster ? 6 : 8, 0, Math.PI * 2);
    ctx.fillStyle = '#F2703C'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = isPoster ? 3 : 4; ctx.stroke();
  });

  // 标签
  ctx.fillStyle = isPoster ? '#9A6A4C' : '#A57150';
  ctx.font = isPoster ? '600 24px sans-serif' : '600 28px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  dims.forEach((d, i) => {
    const lr = r + (isPoster ? 46 : 52);
    const [x, y] = [cx + Math.cos(angles[i]) * lr, cy + Math.sin(angles[i]) * lr];
    ctx.fillText(labels[i], x, y);
    if (!isPoster) {
      ctx.font = '700 24px sans-serif'; ctx.fillStyle = '#E8622C';
      ctx.fillText(pct[d] + '%', x, y + 30);
      ctx.font = '600 28px sans-serif'; ctx.fillStyle = '#A57150';
    }
  });
}

/* ============ 保存长图 ============ */
function wrapLines(ctx, text, maxWidth) {
  const lines = []; let line = '';
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxWidth && line) { lines.push(line); line = ch; }
    else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

$('saveImgBtn').addEventListener('click', () => {
  if (!lastResult) return;
  const W = 750, H = 2680;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#FFF6EC'); bg.addColorStop(1, '#FFEADB');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.arc(700, 120, 150, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(40, 2500, 170, 0, Math.PI * 2); ctx.fill();

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#B08264'; ctx.font = '600 24px sans-serif';
  ctx.fillText('孩 子 性 格 底 色 测 评', W / 2, 70);
  ctx.fillStyle = '#9A6A4C'; ctx.font = '600 26px sans-serif';
  ctx.fillText('你家孩子的性格底色是', W / 2, 114);

  ctx.fillStyle = '#E8622C'; ctx.font = '900 86px sans-serif';
  ctx.fillText(lastResult.result.name, W / 2, 195);
  ctx.fillStyle = '#D9632F'; ctx.font = '700 28px sans-serif';
  ctx.fillText(lastResult.result.tag, W / 2, 245);

  ctx.fillStyle = '#8B6147'; ctx.font = '400 26px sans-serif';
  let heroY = 300;
  wrapLines(ctx, lastResult.result.hero, W - 140).forEach(l => { ctx.fillText(l, W / 2, heroY); heroY += 42; });

  // 雷达图：750x750 画布，图形内容集中在中心半径约200px范围内
  const radarCanvas = document.createElement('canvas');
  radarCanvas.width = 750; radarCanvas.height = 750;
  drawRadar(radarCanvas, lastResult.pct, true);
  ctx.drawImage(radarCanvas, 0, 340, 750, 750); // 图形实际落在页面 340+180=520 到 340+570=910

  let y = 980;
  ctx.fillStyle = '#C46A3A'; ctx.font = '600 25px sans-serif';
  ctx.fillText(`副色 · ${lastResult.sub.name} ｜ ${lastResult.sub.desc}`, W / 2, y);
  y += 46;

  // 内容区块
  const sections = [
    { title: '一眼认出你的孩子', lines: lastResult.result.recognize.map(x => '· ' + x) },
    { title: '养育说明书', lines: lastResult.result.guide.map((g, i) => `${i + 1}. ${g}`) },
    { title: '你会学到的一件事', lines: [lastResult.result.learn] }
  ];
  sections.forEach(sec => {
    // 估算区块高度
    const allLines = [];
    ctx.font = '400 25px sans-serif';
    sec.lines.forEach(l => wrapLines(ctx, l, W - 130).forEach(x => allLines.push(x)));
    const boxH = 70 + allLines.length * 40 + 20;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, 36, y, W - 72, boxH, 24); ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#E8622C'; ctx.font = '800 28px sans-serif';
    ctx.fillText(sec.title, 66, y + 48);
    ctx.fillStyle = '#5D554E'; ctx.font = '400 25px sans-serif';
    let ly = y + 92;
    allLines.forEach(l => { ctx.fillText(l, 66, ly); ly += 40; });
    ctx.textAlign = 'center';
    y += boxH + 24;
  });

  // 金句
  ctx.fillStyle = '#D9632F'; ctx.font = '700 27px sans-serif';
  ctx.fillText('「' + lastResult.result.quotes[0] + '」', W / 2, y + 20);
  y += 66;
  ctx.fillStyle = '#B08264'; ctx.font = '400 21px sans-serif';
  ctx.fillText('趣味参考 · 非临床诊断', W / 2, H - 60);

  const img = c.toDataURL('image/png');
  openModal(`
    <h3>长图已生成</h3>
    <p class="muted">手机：长按下方图片保存到相册<br>电脑：点击下方按钮下载图片</p>
    <img class="modal-image" src="${img}" alt="测评结果长图">
    <a class="btn btn-primary" href="${img}" download="孩子性格底色测评-${lastResult.result.name}.png" style="text-decoration:none;display:inline-block">下载图片</a>
  `);
});

/* ============ 其他按钮 ============ */
$('copyLinkBtn').addEventListener('click', () => {
  const p = lastResult.pct;
  const url = `${location.origin}${location.pathname}?r=${lastResult.key}&s=${lastResult.subKey}&v=${p.E},${p.R},${p.A},${p.P}`;
  copyText(url).then(() => toast('结果链接已复制，发给朋友即可查看')).catch(() => toast('复制失败，请手动复制地址栏链接'));
});

$('copyMomentBtn').addEventListener('click', () => {
  copyText($('rMoment').textContent).then(() => toast('文案已复制')).catch(() => toast('复制失败'));
});

$('againBtn').addEventListener('click', async () => {
  if (!currentPassword) { showScreen('gate'); toast('输入密码即可自己测一次'); return; }
  const btn = $('againBtn'); btn.disabled = true;
  const data = await SUPA.redeem(currentPassword);
  btn.disabled = false;
  if (!data.ok) {
    openModal(`<h3>次数已用完</h3><p>${escapeHtml(data.error || '')}</p><p class="muted">如需继续测评，请重新购买密码</p>
      <button class="btn btn-primary" onclick="closeModal();showScreen('gate')">输入新密码</button>`);
    return;
  }
  answers = new Array(QUESTIONS.length).fill(null);
  current = 0; saveAnswers(); isShared = false;
  sessionStorage.removeItem('qs_last_result');
  showScreen('quiz'); renderQuestion();
  toast(`还可再测 ${data.remaining} 次`);
});

$('reviewBtn').addEventListener('click', () => {
  openModal(`
    <h3>好评有礼</h3>
    <p>感谢您的支持！</p>
    <p>请到店铺给本次测评一个好评，<br>然后将好评截图发给客服，<br>即可领取 <b style="color:#F2703C">1 元返现</b>。</p>
    <button class="btn btn-primary" onclick="closeModal()">我知道了</button>
  `);
});

/* ============ 分享链接直达结果 ============ */
function tryLoadShared() {
  const params = new URLSearchParams(location.search);
  const key = params.get('r');
  if (!key || !RESULTS[key]) return false;
  const safeSub = SUBS[params.get('s')] ? params.get('s') : 'mada';
  const vals = (params.get('v') || '').split(',').map(Number);
  const pct = {};
  ['E', 'R', 'A', 'P'].forEach((d, i) => {
    pct[d] = Number.isFinite(vals[i]) ? Math.min(100, Math.max(0, Math.round(vals[i]))) : 50;
  });
  lastResult = { key, subKey: safeSub, pct, result: RESULTS[key], sub: SUBS[safeSub] };
  isShared = true;
  renderResult(lastResult);
  showScreen('result');
  return true;
}

/* ============ 初始化 ============ */
(function init() {
  if (tryLoadShared()) return;
  // 配置未填好时，在密码页给出明确提示（部署前不会出现）
  if (!SUPA.isReady() && !SUPA.init()) {
    console.warn('Supabase 尚未配置，请在 supabase-config.js 填入项目URL和anon key');
  }
  // 优先恢复结果页
  try {
    const savedResult = JSON.parse(sessionStorage.getItem('qs_last_result'));
    if (savedResult && RESULTS[savedResult.key]) {
      lastResult = {
        key: savedResult.key, subKey: savedResult.subKey,
        pct: savedResult.pct, result: RESULTS[savedResult.key], sub: SUBS[savedResult.subKey]
      };
      renderResult(lastResult);
      showScreen('result');
      return;
    }
  } catch (e) {}
  // 其次恢复答题进度
  if (sessionId) {
    loadAnswers();
    if (answers.some(a => a !== null)) {
      showScreen('quiz'); renderQuestion();
    }
  }
})();
