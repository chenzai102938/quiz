/**
 * 密码管理脚本
 * 用法：
 *   node manage.js list              查看所有密码及使用情况
 *   node manage.js create 20         批量生成20个新密码（每个可测3次）
 *   node manage.js add ABC123 5      手动添加一个密码，可测5次
 *   node manage.js reset ABC123      将某密码的使用次数清零
 *   node manage.js delete ABC123     删除某密码
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'passwords.json');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I/O/0/1

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { return {}; }
}
function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}
function genCode(len = 8) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
function uniqueCode(data) {
  let c;
  do { c = genCode(); } while (data[c]);
  return c;
}

const [cmd, arg1, arg2] = process.argv.slice(2);
const data = load();

switch (cmd) {
  case 'list': {
    const rows = Object.entries(data);
    if (!rows.length) return console.log('当前没有任何密码。');
    console.log('密码'.padEnd(12) + '已用/总次数'.padEnd(14) + '备注');
    console.log('-'.repeat(48));
    rows.forEach(([code, r]) => {
      console.log(code.padEnd(12) + `${r.used}/${r.max}`.padEnd(14) + (r.note || ''));
    });
    console.log(`\n共 ${rows.length} 个密码。`);
    break;
  }
  case 'create': {
    const n = Math.max(1, parseInt(arg1, 10) || 10);
    const created = [];
    for (let i = 0; i < n; i++) {
      const code = uniqueCode(data);
      data[code] = { max: 3, used: 0, note: `批量生成 ${new Date().toISOString().slice(0, 10)}` };
      created.push(code);
    }
    save(data);
    console.log(`已生成 ${n} 个新密码（每个可测3次）：\n` + created.join('\n'));
    break;
  }
  case 'add': {
    if (!arg1) return console.log('用法：node manage.js add ABC123 5');
    const code = String(arg1).toUpperCase();
    if (data[code]) return console.log('该密码已存在。');
    data[code] = { max: Math.max(1, parseInt(arg2, 10) || 3), used: 0, note: '手动添加' };
    save(data);
    console.log(`已添加密码 ${code}，可测 ${data[code].max} 次。`);
    break;
  }
  case 'reset': {
    const code = String(arg1 || '').toUpperCase();
    if (!data[code]) return console.log('密码不存在。');
    data[code].used = 0;
    save(data);
    console.log(`密码 ${code} 的使用次数已清零。`);
    break;
  }
  case 'delete': {
    const code = String(arg1 || '').toUpperCase();
    if (!data[code]) return console.log('密码不存在。');
    delete data[code];
    save(data);
    console.log(`密码 ${code} 已删除。`);
    break;
  }
  default:
    console.log(`密码管理工具
用法：
  node manage.js list              查看所有密码及使用情况
  node manage.js create 20         批量生成20个新密码（每个可测3次）
  node manage.js add ABC123 5      手动添加一个密码，可测5次
  node manage.js reset ABC123      将某密码的使用次数清零
  node manage.js delete ABC123     删除某密码`);
}
