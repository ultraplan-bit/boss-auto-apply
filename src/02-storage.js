// =====================================================================
  // 存储与历史记录
  // =====================================================================

  function gmGet(key, fallback) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
    } catch (error) {
      console.warn(`[${APP_ID}] GM_getValue failed`, error);
    }

    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {
      console.warn(`[${APP_ID}] GM_setValue failed`, error);
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`[${APP_ID}] localStorage set failed`, error);
    }
  }

  function loadConfig() {
    const stored = gmGet(CONFIG_KEY, {});
    return normalizeConfig({ ...DEFAULT_CONFIG, ...(stored || {}) });
  }

  function normalizeConfig(input) {
    const output = { ...DEFAULT_CONFIG, ...(input || {}) };

    // 强行锁死固定参数，忽略存储的旧数据
    output.maxApplyCount = DEFAULT_CONFIG.maxApplyCount;
    output.dailyLimit = DEFAULT_CONFIG.dailyLimit;
    output.delayMinSec = DEFAULT_CONFIG.delayMinSec;
    output.delayMaxSec = DEFAULT_CONFIG.delayMaxSec;
    output.pageDelaySec = DEFAULT_CONFIG.pageDelaySec;
    output.activeWithinDays = DEFAULT_CONFIG.activeWithinDays;

    // 强制锁定默认开启的配置
    output.autoNextPage = true;
    output.fetchDetail = true;
    output.skipAppliedHistory = true;
    output.skipHeadhunter = true;

    return output;
  }

  function saveConfig(nextConfig, silent = false) {
    config = normalizeConfig(nextConfig);
    gmSet(CONFIG_KEY, config);
    if (!silent) {
      renderPanel();
    }
  }

  function getToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function loadHistory() {
    const today = getToday();
    const history = gmGet(getHistoryKey(), null) || {};
    if (history.date !== today) {
      return { date: today, dailyCount: 0, appliedKeys: [] };
    }
    if (!Array.isArray(history.appliedKeys)) history.appliedKeys = [];
    if (!Number.isFinite(Number(history.dailyCount)))
      history.dailyCount = history.appliedKeys.length;
    return history;
  }

  function saveHistory(history) {
    gmSet(getHistoryKey(), history);
  }

  function recordApplied(job) {
    const history = loadHistory();
    const key = getJobUniqueKey(job);
    if (!history.appliedKeys.includes(key)) history.appliedKeys.push(key);
    history.dailyCount = Math.max(
      Number(history.dailyCount) || 0,
      history.appliedKeys.length,
    );
    saveHistory(history);
  }

  function hasAppliedToday(job) {
    const history = loadHistory();
    return history.appliedKeys.includes(getJobUniqueKey(job));
  }

  // =====================================================================
  // 断点续跑：智联翻页会整页跳转，用 GM 存储把运行状态带到下一页
  // =====================================================================

  function saveResumeState(extra = {}) {
    if (!state.running) return;
    const platformId = getPlatformId();
    if (!platformId || platformId === "unknown") return;
    gmSet(RESUME_KEY, {
      platform: platformId,
      updatedAt: Date.now(),
      scanned: state.scanned,
      matched: state.matched,
      applied: state.applied,
      skipped: state.skipped,
      failed: state.failed,
      current: state.current,
      processedKeys: Array.from(state.processedKeys),
      ...extra,
    });
  }

  function clearResumeState() {
    try {
      gmSet(RESUME_KEY, null);
    } catch (error) {
      // ignore
    }
  }

  function takeResumeState() {
    const saved = gmGet(RESUME_KEY, null);
    if (!saved || typeof saved !== "object") return null;
    // 多标签页场景下不要消费其它平台的续跑状态。
    if (saved.platform !== getPlatformId()) return null;
    // 只消费一次，避免后续页面重复自动启动
    gmSet(RESUME_KEY, null);
    const age = Date.now() - Number(saved.updatedAt || 0);
    if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return null;
    return saved;
  }
