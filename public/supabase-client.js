/* Supabase 客户端封装：密码兑换走数据库 RPC 函数 */
const SUPA = (function () {
  let client = null;
  let ready = false;

  function init() {
    const cfg = window.SUPABASE_CONFIG || {};
    if (!cfg.url || cfg.url.indexOf('YOUR_SUPABASE') === 0 ||
        !cfg.anonKey || cfg.anonKey.indexOf('YOUR_SUPABASE') === 0) {
      return false;
    }
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) return false;
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    ready = true;
    return true;
  }

  // 兑换一次测评：返回 { ok, remaining } 或 { ok:false, error }
  async function redeem(password) {
    if (!ready && !init()) {
      return { ok: false, error: '系统配置未完成，请联系客服' };
    }
    try {
      const { data, error } = await client.rpc('redeem_password', { p_code: password });
      if (error) {
        return { ok: false, error: '网络异常，请稍后重试' };
      }
      return data;
    } catch (e) {
      return { ok: false, error: '网络连接失败，请检查网络后重试' };
    }
  }

  return { init, redeem, isReady: () => ready };
})();
