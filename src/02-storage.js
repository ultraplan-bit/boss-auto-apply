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
    return normalizeConfig(gmGet(CONFIG_KEY, {}));
  }

  // 只保留当前支持的配置项，旧版本遗留的字段会被丢弃。
  function normalizeConfig(input) {
    const output = {};
    for (const [key, fallback] of Object.entries(DEFAULT_CONFIG)) {
      const value = input?.[key];
      output[key] = typeof value === typeof fallback ? value : fallback;
    }
    return output;
  }

  function saveConfig(nextConfig, silent = false) {
    config = normalizeConfig(nextConfig);
    gmSet(CONFIG_KEY, config);
    if (!silent) {
      renderPanel();
    }
  }

  function formatDate(date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getToday() {
    return formatDate(new Date());
  }

  // 结构：{ date, dailyCount, applied: { 职位 key: 投递日期 } }。
  // 旧版只记录当天的 appliedKeys，读取时按其 date 迁移。
  function loadHistory() {
    const today = getToday();
    const stored = gmGet(getHistoryKey(), null) || {};
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - HISTORY_RETENTION_DAYS);
    const cutoff = formatDate(cutoffDate);

    const applied = {};
    const entries = [
      ...Object.entries(stored.applied || {}),
      ...(Array.isArray(stored.appliedKeys)
        ? stored.appliedKeys.map((key) => [key, stored.date])
        : []),
    ];
    for (let [key, date] of entries) {
      if (typeof date !== "string" || date <= cutoff) continue;
      // Boss 旧 key：securityId|encryptJobId|lid|jobName|brandName。
      if (getPlatformId() === "boss") {
        const fields = key.split("|");
        if (fields.length >= 5 && fields[1]) key = `boss|${fields[1]}`;
      }
      if (!applied[key] || date > applied[key]) applied[key] = date;
    }

    let dailyCount = 0;
    if (stored.date === today) {
      dailyCount = Number(stored.dailyCount);
      if (!Number.isFinite(dailyCount)) {
        dailyCount = Object.values(applied).filter((date) => date === today)
          .length;
      }
    }
    return { date: today, dailyCount, applied };
  }

  function saveHistory(history) {
    gmSet(getHistoryKey(), history);
  }

  function recordApplied(job) {
    const history = loadHistory();
    const key = getJobUniqueKey(job);
    if (history.applied[key] !== history.date) history.dailyCount += 1;
    history.applied[key] = history.date;
    saveHistory(history);
  }

  function hasAppliedBefore(job) {
    return Boolean(loadHistory().applied[getJobUniqueKey(job)]);
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
