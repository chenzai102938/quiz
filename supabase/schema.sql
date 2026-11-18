-- ============================================================
-- 孩子性格底色测评 · Supabase 数据库初始化脚本（修复版）
-- 用法：Supabase 控制台 → SQL Editor → New query → 粘贴全部内容 → 点 Run
-- 说明：本脚本可重复运行，不会破坏已有密码数据
-- ============================================================

-- 1. 密码表
create table if not exists public.passwords (
  code text primary key,
  max_uses int not null default 3,
  used int not null default 0,
  note text,
  created_at timestamptz not null default now()
);

-- 2. 开启行级安全：禁止前端直接读写表，只能通过下面的函数操作
alter table public.passwords enable row level security;

-- 3. 核心函数：兑换一次测评（校验密码 + 原子扣次数）
create or replace function public.redeem_password(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_code text := upper(trim(p_code));
  v_max int;
  v_used int;
begin
  select max_uses, used into v_max, v_used
    from public.passwords as t
   where t.code = v_code
   for update;

  if not found then
    return json_build_object('ok', false, 'error', '密码无效，请检查后重新输入');
  end if;

  if v_used >= v_max then
    return json_build_object('ok', false, 'error', '该密码的 3 次测评机会已用完，请联系客服购买新密码');
  end if;

  update public.passwords as t set used = t.used + 1 where t.code = v_code;

  return json_build_object('ok', true, 'remaining', v_max - v_used - 1);
end;
$fn$;

revoke all on function public.redeem_password(text) from public;
grant execute on function public.redeem_password(text) to anon, authenticated;

-- 4. 管理函数：批量生成密码（仅数据库管理员可调用，前端无法调用）
create or replace function public.generate_passwords(p_count int default 10, p_note text default '')
returns table(out_code text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  j int;
  v_new text;
begin
  for i in 1..p_count loop
    loop
      v_new := '';
      for j in 1..8 loop
        v_new := v_new || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
      end loop;
      exit when not exists (select 1 from public.passwords as t where t.code = v_new);
    end loop;
    insert into public.passwords(code, max_uses, used, note) values (v_new, 3, 0, p_note);
    return query select v_new;
  end loop;
end;
$fn$;

revoke all on function public.generate_passwords(int, text) from public;
revoke all on function public.generate_passwords(int, text) from anon, authenticated;

-- 5. 演示密码
insert into public.passwords(code, max_uses, used, note)
values
  ('DEMO2026', 3, 0, '演示密码'),
  ('KIDS2026', 3, 0, '演示密码')
on conflict (code) do nothing;

-- ============================================================
-- 验证：另开一个 query 运行 select public.redeem_password('DEMO2026');
-- 应返回 {"ok": true, "remaining": 2}
-- 重置：update public.passwords set used = 0 where code = 'DEMO2026';
-- 生成密码：select * from public.generate_passwords(20, '新批次');
-- ============================================================
