// ==UserScript==
// @name         Boss/猎聘/智联/前程无忧 自动投递助手
// @namespace    https://github.com/ultraplan-bit/boss-auto-apply
// @version      0.2.7
// @description  在 Boss 直聘、猎聘、智联招聘、前程无忧的职位列表页按筛选规则自动批量投递（基于 muyuniao 原脚本二次开发）。
// @author       plove
// @homepageURL  https://github.com/ultraplan-bit/boss-auto-apply
// @supportURL   https://github.com/ultraplan-bit/boss-auto-apply/issues
// @license      MIT
// @match        https://www.zhipin.com/web/geek/job*
// @match        https://www.zhipin.com/web/geek/jobs*
// @match        https://www.zhipin.com/web/geek/job-recommend*
// @match        https://www.zhipin.com/web/geek/overseas*
// @match        https://www.liepin.com/zhaopin*
// @match        https://sou.zhaopin.com/*
// @match        https://www.zhaopin.com/sou*
// @match        https://www.zhaopin.com/jobs*
// @match        https://*.zhaopin.com/*
// @match        https://we.51job.com/pc/search*
// @match        https://www.shixiseng.com/interns*
// @match        https://resume.shixiseng.com/interns*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        unsafeWindow
// ==/UserScript==

(() => {
  "use strict";

  const APP_ID = "boss-auto-apply-lite";
  const CONFIG_KEY = `${APP_ID}:config`;
  // Boss 继续沿用旧 key，保证历史投递记录不丢失。
  const HISTORY_KEY = `${APP_ID}:history`;
  const RESUME_KEY = `${APP_ID}:resume`;
  const PANEL_ID = `${APP_ID}-panel`;
  const STYLE_ID = `${APP_ID}-style`;
  const VERSION = "0.2.7";

  const DEFAULT_CONFIG = {
    autoNextPage: true,
    fetchDetail: true,
    debug: false,
    skipAppliedHistory: true,
    skipHeadhunter: true,
    onlyOnlineBoss: false,
    maxApplyCount: 9999,
    dailyLimit: 150,
    delayMinSec: 4,
    delayMaxSec: 10,
    pageDelaySec: 3,
    activeWithinDays: 14,
    includeDescriptionKeywords: "",
    excludeDescriptionKeywords: "",
    shixisengResume: "",
    shixisengReportTime: "",
    shixisengInternshipTime: "",
    shixisengDays: "",
    liepinGreeting:
      "您好，我对贵公司发布的这个职位很感兴趣，期待进一步了解。",
    bossImageResumeEnabled: false,
  };

  const BOSS_SELECTORS = {
    jobCards: [
      ".job-card-wrapper",
      ".job-card-wrap",
      ".job-card-box",
      ".job-list-box .job-card-body",
      ".rec-job-list .job-card-wrapper",
    ],
    scrollContainers: [
      ".job-list-container",
      ".job-list",
      ".recommend-job-list",
      ".job-recommend-result",
      ".recommend-result-inner",
      ".page-job-inner",
    ],
    nextIcon: ".ui-icon-arrow-right",
  };

  const LIEPIN_SELECTORS = {
    jobCards: [
      // 2026 年猎聘前端使用驼峰类名；同时兼容历史/灰度模板的连字符类名。
      'div[class*="jobCardPcContainer"]',
      'div[class*="job-card-pc-container"]',
      "li[data-tlg-ext]",
      'a[data-nick="job-detail-job-info"]',
      'a[href*="/job/"]',
      'a[href*="/a/"]',
    ],
    actionLabels: /聊一聊|继续聊|立即沟通/,
    // 聊天窗口可能在类名改版后换了容器；以 im-ui 前缀兜底，避免只认某几个固定类名。
    chatRoots: [
      "#im-c-entry",
      '[class*="im-ui-chat-modal"]',
      '[class*="im-ui-basic-chat"]',
      '[class*="im-ui-chat-container"]',
      ".im-ui-chat-container",
      '[class*="im-ui-pro-wrapper"]',
      '[class*="ant-im-modal-wrap"]',
      '[class*="chat-modal"]',
      '[class*="chat-container"]',
    ],
    chatEditor:
      'textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"][aria-multiline="true"], #chat-input, input[type="text"], input:not([type])',
  };

  const QIANCHENG_SELECTORS = {
    jobCards: [".joblist-item"],
    searchPagination: ".pageation .el-pagination",
    applyButton: "button.btn.apply",
    feedback: [
      ".el-message",
      ".el-dialog__wrapper",
      ".van-popup",
      "[role='dialog']",
      "[role='alert']",
      "[role='status']",
      "[class*='toast']",
    ],
  };

  const SHIXISENG_SELECTORS = {
    jobCards: [".intern-item"],
    feedback: [
      ".el-message",
      ".el-dialog__wrapper",
      "[role='dialog']",
      "[role='alert']",
      "[role='status']",
      "[class*='toast']",
    ],
  };

  const ZHAOPIN_SELECTORS = {
    jobCards: [
      ".joblist-box__item",
      ".positionlist .joblist-box__item",
      ".job-list-panel .joblist-box__item",
      ".joblist-box .joblist-item",
      // 2026 新版左右分栏布局
      ".job-list-panel .job-card",
      ".jobs-list-sort-scroll .job-card",
      '[class*="joblist-box"] [class*="jobItem"]',
      '[class*="job-list-panel"] [class*="jobItem"]',
    ],
    applyButton: [
      ".collect-and-apply__btn",
      ".apply-btn",
      '[class*="collect-and-apply"] button',
      '[class*="job-apply"] button',
    ],
    feedback: [
      ".a-job-apply-workflow",
      ".a-dialog",
      ".deliver-dialog",
      ".deliver-greeting-modal",
      ".el-dialog",
      ".ant-modal",
      "[role='dialog']",
      "[role='alert']",
      "[role='status']",
      ".ant-message",
      ".el-message",
      "[class*='toast']",
    ],
  };

  const LIEPIN_FEEDBACK_SELECTORS = [
    ".ant-modal",
    ".ant-modal-confirm",
    ".ant-message",
    ".ant-notification",
    ".ant-im-modal",
    ".ant-im-modal-confirm",
    ".ant-im-message",
    ".ant-im-notification",
    "[role='dialog']",
    "[role='alert']",
    "[role='status']",
    ".im-ui-modal",
    ".im-ui-toast",
    "[class*='im-ui'][class*='modal']",
    "[class*='toast']",
  ];

  const state = {
    running: false,
    stopping: false,
    collapsed: false,
    scanned: 0,
    matched: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
    platformRemainingQuota: null,
    current: "未开始",
    logs: [],
    processedKeys: new Set(),
    bossResumeImage: null,
  };

  // 智联岗位卡片对应的 Vue 数据缓存，避免每张卡片重复深度遍历。
  const zhaopinPositionCache = new WeakMap();

  let config = loadConfig();
  let cachedPanel = null;

  // =====================================================================
  // 平台适配器
  // =====================================================================

  const ADAPTERS = {
    boss: {
      id: "boss",
      label: "Boss 直聘",
      onlineLabel: "仅在线 BOSS",
      exampleUrl: "https://www.zhipin.com/web/geek/job",
      isListPage: isBossJobPage,
      ensureLogin: ensureBossLogin,
      getCards: getBossJobCardElements,
      buildJob: buildBossJobDetail,
      fetchDetail: fetchBossJobDetail,
      apply: applyBossJob,
      nextPage: goBossNextPageOrScroll,
      canApply: (job) =>
        Boolean(job?.securityId && job?.encryptJobId && job?.lid),
      noApplyReason: "缺少 securityId / encryptJobId / lid，无法调用投递接口",
      shouldSkip: bossShouldSkip,
      supportsOnlineFilter: true,
    },
    liepin: {
      id: "liepin",
      label: "猎聘",
      onlineLabel: "仅在线招聘者",
      exampleUrl: "https://www.liepin.com/zhaopin/",
      isListPage: isLiepinListPage,
      ensureLogin: ensureLiepinLogin,
      getCards: getLiepinJobCardElements,
      buildJob: buildLiepinJobDetail,
      fetchDetail: fetchLiepinJobDetail,
      apply: applyLiepinJob,
      nextPage: goLiepinNextPage,
      canApply: (job) =>
        Boolean(job?.actionAvailable || job?.detailUrl || job?.jobId),
      noApplyReason: "未找到聊一聊按钮（可能已沟通或岗位已关闭）",
      supportsOnlineFilter: true,
    },
    shixiseng: {
      id: "shixiseng",
      label: "实习僧",
      onlineLabel: "仅在线招聘者",
      exampleUrl: "https://www.shixiseng.com/interns",
      isListPage: isShixisengListPage,
      ensureLogin: ensureShixisengLogin,
      createApplySession: createShixisengApplySession,
      closeApplySession: closeShixisengApplySession,
      getCards: getShixisengJobCardElements,
      buildJob: buildShixisengJobDetail,
      fetchDetail: fetchShixisengJobDetail,
      apply: applyShixisengJob,
      nextPage: goShixisengNextPage,
      canApply: (job) => Boolean(job?.jobId && !job?.externalApply),
      noApplyReason: "缺少职位 ID 或该职位需前往外部网站投递",
      supportsOnlineFilter: true,
    },
    qiancheng: {
      id: "qiancheng",
      label: "前程无忧",
      onlineLabel: "仅在线招聘者",
      exampleUrl: "https://we.51job.com/pc/search",
      isListPage: isQianchengListPage,
      ensureLogin: ensureQianchengLogin,
      getCards: getQianchengJobCardElements,
      buildJob: buildQianchengJobDetail,
      fetchDetail: fetchQianchengJobDetail,
      apply: applyQianchengJob,
      nextPage: goQianchengNextPage,
      canApply: (job) => Boolean(job?.jobId && !job?.externalApply),
      noApplyReason: "缺少职位 ID 或该职位需前往官网投递",
      supportsOnlineFilter: true,
    },
    zhaopin: {
      id: "zhaopin",
      label: "智联招聘",
      onlineLabel: "仅在线 HR",
      exampleUrl: "https://sou.zhaopin.com/",
      isListPage: isZhaopinListPage,
      ensureLogin: ensureZhaopinLogin,
      getCards: getZhaopinJobCardElements,
      buildJob: buildZhaopinJobDetail,
      fetchDetail: fetchZhaopinJobDetail,
      apply: applyZhaopinJob,
      nextPage: goZhaopinNextPage,
      canApply: (job) =>
        Boolean(job?.applyAvailable || String(job?.applyType) === "1"),
      noApplyReason: "未找到立即投递按钮（可能已投递或需跳转外部投递）",
      supportsOnlineFilter: true,
    },
  };

  function getPlatformId() {
    const host = String(location.hostname || "");
    if (/(^|\.)zhipin\.com$/i.test(host)) return "boss";
    if (/(^|\.)liepin\.com$/i.test(host)) return "liepin";
    if (/(^|\.)zhaopin\.com$/i.test(host)) return "zhaopin";
    if (/(^|\.)51job\.com$/i.test(host)) return "qiancheng";
    if (/(^|\.)shixiseng\.com$/i.test(host)) return "shixiseng";
    return "unknown";
  }

  function getAdapter() {
    return ADAPTERS[getPlatformId()] || null;
  }

  // 平台自身的每日投递上限；智联招聘和前程无忧约为 100 次/天。
  const PLATFORM_DAILY_LIMITS = {
    zhaopin: 100,
    qiancheng: 100,
  };

  function getDailyLimit(adapter = getAdapter()) {
    const platformLimit = adapter ? PLATFORM_DAILY_LIMITS[adapter.id] : null;
    return Number.isFinite(platformLimit)
      ? Math.min(config.dailyLimit, platformLimit)
      : config.dailyLimit;
  }

  function isSupportedListPage() {
    const adapter = getAdapter();
    return Boolean(adapter && adapter.isListPage());
  }

  function getHistoryKey() {
    const platformId = getPlatformId();
    return platformId === "boss"
      ? HISTORY_KEY
      : `${APP_ID}:${platformId}:history`;
  }

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

  // =====================================================================
  // 通用工具
  // =====================================================================

  function getPageWindow() {
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow) {
        return unsafeWindow;
      }
    } catch (error) {
      // ignore
    }
    return window;
  }

  function getPageGlobal(name) {
    try {
      const pageWindow = getPageWindow();
      if (pageWindow && pageWindow[name] !== undefined) return pageWindow[name];
    } catch (error) {
      // ignore
    }
    try {
      return window[name];
    } catch (error) {
      return undefined;
    }
  }

  function getCookie(name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${escapedName}=([^;]*)`),
    );
    return match ? decodeURIComponent(match[1]) : "";
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function randomBetween(min, max) {
    if (max <= min) return min;
    return min + Math.random() * (max - min);
  }

  async function sleepHumanDelay() {
    const seconds = randomBetween(config.delayMinSec, config.delayMaxSec);
    await sleep(seconds * 1000);
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitKeywords(value) {
    return String(value || "")
      .split(/[，,\n;]/)
      .map((item) => normalizeText(item).toLowerCase())
      .filter(Boolean);
  }

  function textHasAny(text, keywords) {
    const normalized = normalizeText(text).toLowerCase();
    return keywords.some((keyword) => normalized.includes(keyword));
  }

  function textHasInclude(text, keywords) {
    if (keywords.length === 0) return true;
    return textHasAny(text, keywords);
  }

  function fuzzyText(job, detail) {
    return [
      job.jobName,
      job.brandName,
      job.salaryDesc,
      job.cityName,
      job.areaDistrict,
      job.businessDistrict,
      job.brandScaleName,
      job.brandIndustry,
      job.filterText,
      Array.isArray(job.jobLabels) ? job.jobLabels.join(" ") : job.jobLabels,
      Array.isArray(job.skills) ? job.skills.join(" ") : job.skills,
      detail?.postDescription,
      detail?.address,
      detail?.activeTimeDesc,
    ]
      .map(normalizeText)
      .filter(Boolean)
      .join(" ");
  }

  function toHttps(url) {
    return String(url || "").replace(/^http:\/\//i, "https://");
  }

  function isElementVisible(element) {
    if (
      !element ||
      typeof element !== "object" ||
      typeof element.getClientRects !== "function"
    ) {
      return false;
    }
    try {
      if (!element.getClientRects().length) return false;
      const rect = element.getBoundingClientRect();
      // 过滤掉 1px 视觉隐藏节点，避免把预渲染/读屏文本误判为弹窗。
      if (rect.width < 2 && rect.height < 2) return false;
      if (typeof element.checkVisibility === "function") {
        try {
          if (
            !element.checkVisibility({
              checkOpacity: true,
              checkVisibilityCSS: true,
            })
          ) {
            return false;
          }
        } catch (error) {
          // ignore
        }
      }
      const style = window.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0
      );
    } catch (error) {
      return true;
    }
  }

  function isDisabled(element) {
    if (!element) return true;
    if (element.disabled) return true;
    if (element.hasAttribute("disabled")) return true;
    if (element.getAttribute("aria-disabled") === "true") return true;
    return /(^|[\s-])(disabled|disable|is-disabled|is-disable)([\s-]|$)/.test(
      String(element.className || ""),
    );
  }

  function hasVisibleLoginSurface() {
    const selectors = [
      "iframe[src*='passport']",
      "iframe[src*='login']",
      ".passport-login",
      ".login-dialog",
      ".login-modal",
      "#loginname",
      ".login-submit-btn",
      // 智联新版左右分栏页的登录遮罩
      ".job-list-login-gate",
      ".job-list-login-gate__btn",
    ];
    return selectors.some((selector) =>
      Array.from(document.querySelectorAll(selector)).some(isElementVisible),
    );
  }

  function pickDomText(root, selectors) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const text = normalizeText(
        element?.innerText || element?.textContent || "",
      );
      if (text) return text;
    }
    return "";
  }

  function pickDomAttr(root, selectors, attr) {
    for (const selector of selectors) {
      const element = root.querySelector(selector);
      const value = normalizeText(element?.getAttribute(attr) || "");
      if (value) return value;
    }
    return "";
  }

  function pickFirstString(obj, keys) {
    for (const key of keys) {
      const value = getDeepValue(obj, key);
      if (value !== undefined && value !== null && String(value).trim() !== "")
        return String(value).trim();
    }
    return "";
  }

  function pickBoolean(obj, keys) {
    for (const key of keys) {
      const value = getDeepValue(obj, key);
      if (typeof value === "boolean") return value;
      if (value === 0 || value === 1) return Boolean(value);
      if (value === "true") return true;
      if (value === "false") return false;
    }
    return undefined;
  }

  function getDeepValue(obj, wantedKey) {
    if (!obj || typeof obj !== "object") return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, wantedKey))
      return obj[wantedKey];

    const queue = [obj];
    const seen = new WeakSet();
    let depthGuard = 0;
    while (queue.length && depthGuard < 120) {
      depthGuard += 1;
      const current = queue.shift();
      if (!current || typeof current !== "object" || seen.has(current))
        continue;
      seen.add(current);
      if (Object.prototype.hasOwnProperty.call(current, wantedKey))
        return current[wantedKey];
      for (const value of Object.values(current).slice(0, 40)) {
        if (value && typeof value === "object") queue.push(value);
      }
    }
    return undefined;
  }

  function findObjectByPredicate(seedList, predicate, maxDepth = 5) {
    const queue = (seedList || [])
      .filter(Boolean)
      .map((value) => ({ value, depth: 0 }));
    const seen = new WeakSet();

    while (queue.length) {
      const { value, depth } = queue.shift();
      if (!value || typeof value !== "object") continue;
      if (seen.has(value)) continue;
      seen.add(value);

      if (predicate(value)) return value;
      if (depth >= maxDepth) continue;

      for (const child of Object.values(value).slice(0, 60)) {
        if (child && typeof child === "object") {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }
    return null;
  }

  function collectCardsBySelectors(
    selectors,
    { preferVisible = true, firstNonEmpty = false } = {},
  ) {
    const rawElements = [];

    if (firstNonEmpty) {
      // 猎聘/智联使用“首个命中即停”，避免宽泛兜底选择器把侧栏推荐卡片混进来。
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        if (nodes.length) {
          rawElements.push(...nodes);
          break;
        }
      }
    } else {
      const seen = new Set();
      for (const selector of selectors) {
        for (const item of document.querySelectorAll(selector)) {
          if (!seen.has(item)) {
            seen.add(item);
            rawElements.push(item);
          }
        }
      }
    }

    const result = rawElements.filter(
      (item) =>
        !rawElements.some((other) => other !== item && other.contains(item)),
    );

    if (!preferVisible) return result;
    const visible = result.filter(isElementVisible);
    return visible.length ? visible : result;
  }

  function collectVisibleText(selectors, extraFilter) {
    const roots = [];
    const seenText = new Set();
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!isElementVisible(element)) continue;
        const text = normalizeText(
          element.innerText || element.textContent || "",
        );
        if (!text || text.length > 2000) continue;
        if (extraFilter && !extraFilter(text, element)) continue;
        if (seenText.has(text)) continue;
        seenText.add(text);
        roots.push({ element, text });
      }
    }
    return roots;
  }

  function findButtonByText(root, labels) {
    if (!root) return null;
    const nodes = root.querySelectorAll("button, a, [role='button']");
    let fallback = null;
    for (const node of nodes) {
      if (isDisabled(node) || !isElementVisible(node)) continue;
      const text = normalizeText(node.innerText || node.textContent || "");
      if (!text) continue;
      if (labels.some((label) => text === label)) return node;
      if (!fallback && labels.some((label) => text.includes(label)))
        fallback = node;
    }
    return fallback;
  }

  function installPopupWatch() {
    const opened = [];
    const targetWindow = getPageWindow();
    const originalOpen = targetWindow.open;
    let restored = false;

    const restore = () => {
      if (restored) return;
      restored = true;
      try {
        targetWindow.open = originalOpen;
      } catch (error) {
        // ignore
      }
    };

    try {
      targetWindow.open = function patchedOpen(...args) {
        try {
          const popup = originalOpen.apply(this, args);
          if (popup) opened.push(popup);
          return popup;
        } catch (error) {
          return null;
        }
      };
    } catch (error) {
      // ignore
    }

    return {
      opened,
      restore,
      closeAll() {
        for (const popup of opened) {
          try {
            popup.close();
          } catch (error) {
            // ignore
          }
        }
      },
    };
  }

  function isLimitText(text) {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    return /今日.*(投递|申请|沟通).*(上限|已达|用完|超过)|(投递|申请|沟通).*(次数|数量).*(上限|已达|用完)|已达.*(上限|限制)|上限.*次|操作(过于)?频繁|请求频繁|访问频繁|非会员|开通会员|升级会员/.test(
      normalized,
    );
  }

  function isLoginOrVerifyText(text) {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    return /请先登录|登录后|扫码登录|验证码|安全验证|身份验证|账号.*异常|行为异常|临时封禁|封禁/.test(
      normalized,
    );
  }

  function isResumeIssueText(text) {
    const normalized = normalizeText(text);
    if (!normalized) return false;
    return /完善简历|创建简历|上传简历|简历.*(不完整|未通过)|附件.*(未通过|异常)|请选择简历/.test(
      normalized,
    );
  }

  // =====================================================================
  // 日志、通知与面板
  // =====================================================================

  function log(level, message, data) {
    if (level === "debug" && !config.debug) return;
    const time = new Date().toLocaleTimeString();
    const entry = { time, level, message, data };
    state.logs.unshift(entry);
    state.logs = state.logs.slice(0, 120);

    const prefix = `[${APP_ID}] ${message}`;
    if (level === "error") console.error(prefix, data || "");
    else if (level === "warn") console.warn(prefix, data || "");
    else if (level === "debug") console.debug(prefix, data || "");
    else console.log(prefix, data || "");

    renderPanel();
  }

  function notify(title, text) {
    try {
      if (typeof GM_notification === "function") {
        GM_notification({ title, text, timeout: 3500 });
      }
    } catch (error) {
      console.warn(`[${APP_ID}] notification failed`, error);
    }
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147483647;
        width: 380px;
        max-height: calc(100vh - 36px);
        overflow: hidden;
        border-radius: 14px;
        background: #ffffff;
        color: #1f2937;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(15, 23, 42, 0.08);
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${PANEL_ID} * { box-sizing: border-box; }
      #${PANEL_ID} .aj-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        color: #fff;
        background: linear-gradient(135deg, #00bebd, #12a0a8);
      }
      #${PANEL_ID} .aj-title { font-weight: 700; font-size: 14px; }
      #${PANEL_ID} .aj-subtitle { opacity: .88; font-size: 11px; }
      #${PANEL_ID} .aj-icon-btn {
        border: 0;
        border-radius: 8px;
        padding: 4px 8px;
        cursor: pointer;
        color: #fff;
        background: rgba(255,255,255,.18);
      }
      #${PANEL_ID}.is-collapsed { width: 240px; }
      #${PANEL_ID}.is-collapsed .aj-body { display: none; }
      #${PANEL_ID} .aj-body {
        max-height: calc(100vh - 92px);
        overflow: auto;
        padding: 10px 12px 12px;
      }
      #${PANEL_ID} .aj-status {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 6px;
        margin-bottom: 10px;
      }
      #${PANEL_ID} .aj-stat {
        border-radius: 10px;
        padding: 6px 4px;
        background: #f8fafc;
        text-align: center;
        border: 1px solid #e5e7eb;
      }
      #${PANEL_ID} .aj-stat b { display: block; font-size: 15px; color: #0f766e; }
      #${PANEL_ID} .aj-stat span { font-size: 11px; color: #64748b; }
      #${PANEL_ID} .aj-current {
        margin: 8px 0 10px;
        padding: 7px 9px;
        border-radius: 10px;
        background: #f0fdfa;
        color: #115e59;
        border: 1px solid #ccfbf1;
        word-break: break-word;
      }
      #${PANEL_ID} .aj-form {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      #${PANEL_ID} .aj-field { display: flex; flex-direction: column; gap: 4px; }
      #${PANEL_ID} .aj-field.aj-wide { grid-column: 1 / -1; }
      #${PANEL_ID} label { color: #334155; font-size: 12px; }
      #${PANEL_ID} input[type="text"],
      #${PANEL_ID} input[type="number"],
      #${PANEL_ID} input[type="file"],
      #${PANEL_ID} textarea,
      #${PANEL_ID} select {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 6px 8px;
        outline: none;
        font: inherit;
        background: #fff;
      }
      #${PANEL_ID} textarea { min-height: 42px; resize: vertical; }
      #${PANEL_ID} input:focus,
      #${PANEL_ID} textarea:focus,
      #${PANEL_ID} select:focus { border-color: #14b8a6; box-shadow: 0 0 0 3px rgba(20,184,166,.14); }
      #${PANEL_ID} .aj-checks {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 8px;
        padding: 8px;
        border-radius: 10px;
        background: #f8fafc;
        border: 1px solid #e5e7eb;
      }
      #${PANEL_ID} .aj-check {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      #${PANEL_ID} .aj-check input { accent-color: #0d9488; }
      #${PANEL_ID} .aj-actions {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 7px;
        margin: 10px 0;
      }
      #${PANEL_ID} .aj-btn {
        border: 0;
        border-radius: 9px;
        padding: 7px 8px;
        cursor: pointer;
        font-weight: 650;
        color: #0f172a;
        background: #e2e8f0;
      }
      #${PANEL_ID} .aj-btn:hover { filter: brightness(.98); }
      #${PANEL_ID} .aj-btn-primary { background: #14b8a6; color: #fff; }
      #${PANEL_ID} .aj-btn-danger { background: #ef4444; color: #fff; }
      #${PANEL_ID} .aj-btn:disabled { opacity: .55; cursor: not-allowed; }
      #${PANEL_ID} .aj-logs {
        max-height: 190px;
        overflow: auto;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        background: #0f172a;
        padding: 8px;
      }
      #${PANEL_ID} .aj-log {
        color: #cbd5e1;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        line-height: 1.45;
        padding: 2px 0;
        white-space: pre-wrap;
        word-break: break-word;
      }
      #${PANEL_ID} .aj-log-success { color: #86efac; }
      #${PANEL_ID} .aj-log-warn { color: #fde68a; }
      #${PANEL_ID} .aj-log-error { color: #fca5a5; }
      #${PANEL_ID} .aj-log-debug { color: #93c5fd; }
    `;

    if (typeof GM_addStyle === "function") {
      GM_addStyle(css);
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function htmlEscape(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderPanel() {
    if (!cachedPanel) return;
    const adapter = getAdapter();
    const history = loadHistory();
    cachedPanel.classList.toggle("is-collapsed", state.collapsed);
    const runningText = state.running
      ? state.stopping
        ? "停止中"
        : "运行中"
      : "空闲";
    const quotaText =
      state.platformRemainingQuota == null
        ? ""
        : ` · 平台剩余 ${state.platformRemainingQuota}`;
    const dailyLimit = getDailyLimit(adapter);
    const logsHtml = state.logs.length
      ? state.logs
        .map(
          (item) =>
            `<div class="aj-log aj-log-${item.level}">[${htmlEscape(item.time)}] ${htmlEscape(item.message)}</div>`,
        )
        .join("")
      : '<div class="aj-log">暂无日志。点击“开始”按钮进行自动投递。</div>';
    const title = adapter ? `${adapter.label} 自动投递助手` : "自动投递助手";
    const onlineLabel = adapter?.onlineLabel || "仅在线 BOSS";
    // 猎聘招呼语只在猎聘页面显示，避免影响另外两个平台的面板。
    const liepinGreetingField =
      adapter?.id === "liepin"
        ? textAreaHtml("liepinGreeting", "猎聘招呼语（未自动发送时补发）")
        : "";
    const bossImageResumeSettings =
      adapter?.id === "boss" ? renderBossImageResumeSettings() : "";
    const shixisengSettings =
      adapter?.id === "shixiseng" ? renderShixisengSettings() : "";

    cachedPanel.innerHTML = `
      <div class="aj-header">
        <div>
          <div class="aj-title">${htmlEscape(title)}</div>
          <div class="aj-subtitle">v${VERSION} · ${runningText} · 今日已投 ${history.dailyCount}/${dailyLimit}${quotaText}</div>
        </div>
        <button class="aj-icon-btn" data-action="toggle-collapse">${state.collapsed ? "展开" : "收起"}</button>
      </div>
      <div class="aj-body">
        <div class="aj-status">
          <div class="aj-stat"><b>${state.scanned}</b><span>扫描</span></div>
          <div class="aj-stat"><b>${state.matched}</b><span>匹配</span></div>
          <div class="aj-stat"><b>${state.applied}</b><span>成功</span></div>
          <div class="aj-stat"><b>${state.skipped}</b><span>跳过</span></div>
          <div class="aj-stat"><b>${state.failed}</b><span>失败</span></div>
        </div>
        <div class="aj-current">当前：${htmlEscape(state.current)}</div>
        <form class="aj-form" data-role="config-form">
          <div class="aj-checks">
            ${checkboxHtml("onlyOnlineBoss", onlineLabel)}
            ${checkboxHtml("debug", "调试日志")}
          </div>
          ${textAreaHtml("includeDescriptionKeywords", "岗位详情包含关键词")}
          ${textAreaHtml("excludeDescriptionKeywords", "岗位详情排除关键词")}
          ${liepinGreetingField}
          ${bossImageResumeSettings}
          ${shixisengSettings}
        </form>
        <div class="aj-actions">
          <button class="aj-btn aj-btn-primary" data-action="start" ${state.running ? "disabled" : ""}>开始</button>
          <button class="aj-btn aj-btn-danger" data-action="stop" ${state.running ? "" : "disabled"}>停止</button>
        </div>
        <div class="aj-logs">${logsHtml}</div>
      </div>
    `;
  }

  function renderBossImageResumeSettings() {
    return `
      <div class="aj-field aj-wide">
        ${checkboxHtml("bossImageResumeEnabled", "打招呼后自动发送图片简历")}
        <input type="file" name="bossResumeImage" accept="image/jpeg,image/png,image/gif,image/webp" ${state.bossResumeImage ? "disabled" : ""}>
        ${state.bossResumeImage ? '<button class="aj-btn" type="button" data-action="clear-boss-resume">清除图片</button>' : ""}
        <span data-role="boss-resume-image-name">${htmlEscape(state.bossResumeImage?.name || "请选择图片简历（仅在当前页面有效）")}</span>
      </div>
    `;
  }

  function renderShixisengSettings() {
    const resumeOptions = [
      ["", "请选择简历"],
      ["online", "在线简历"],
      ["attach", "附件简历（同时投递在线简历）"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${config.shixisengResume === value ? "selected" : ""}>${label}</option>`,
      )
      .join("");
    return `
      <div class="aj-field aj-wide">
        <label>实习僧投递简历</label>
        <select name="shixisengResume">${resumeOptions}</select>
      </div>
      ${selectHtml("shixisengReportTime", "到岗时间", ["", "1周内", "2周内", "1个月内", "3个月内"], "跟随职位默认")}
      ${selectHtml("shixisengInternshipTime", "实习时长", ["", "3个月以内", "3-6个月", "6个月以上"], "跟随职位默认")}
      ${selectHtml("shixisengDays", "每周出勤", ["", "1天", "2天", "3天", "4天", "5天", "6天"], "跟随职位默认")}
    `;
  }

  function selectHtml(name, label, options, defaultLabel) {
    return `
      <div class="aj-field aj-wide">
        <label>${label}</label>
        <select name="${name}">
          ${options
            .map(
              (value) =>
                `<option value="${htmlEscape(value)}" ${config[name] === value ? "selected" : ""}>${value ? htmlEscape(value) : defaultLabel}</option>`,
            )
            .join("")}
        </select>
      </div>
    `;
  }

  function checkboxHtml(name, label) {
    return `<label class="aj-check"><input type="checkbox" name="${name}" ${config[name] ? "checked" : ""}> ${label}</label>`;
  }

  function textAreaHtml(name, label) {
    return `
      <div class="aj-field aj-wide">
        <label>${label}</label>
        <textarea name="${name}">${htmlEscape(config[name])}</textarea>
      </div>
    `;
  }

  function collectFormConfig() {
    const form = cachedPanel?.querySelector('[data-role="config-form"]');
    if (!form) return config;
    const next = { ...config };
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      const field = form.elements.namedItem(key);
      if (!field) continue;
      if (field instanceof HTMLInputElement && field.type === "checkbox") {
        next[key] = field.checked;
      } else if (field instanceof HTMLInputElement && field.type === "number") {
        next[key] = Number(field.value);
      } else if (
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement
      ) {
        next[key] = field.value;
      }
    }
    return normalizeConfig(next);
  }

  function mountPanel() {
    if (!document.body || cachedPanel) return;
    addStyles();
    cachedPanel = document.createElement("div");
    cachedPanel.id = PANEL_ID;
    document.body.appendChild(cachedPanel);
    cachedPanel.addEventListener("click", handlePanelClick);
    cachedPanel.addEventListener("input", handleFormInput);
    cachedPanel.addEventListener("change", handleFormInput);
    renderPanel();
  }

  function handleFormInput(event) {
    const form = cachedPanel?.querySelector('[data-role="config-form"]');
    if (!form || !form.contains(event.target)) return;
    if (event.target instanceof HTMLInputElement && event.target.type === "file") {
      const file = event.target.files?.[0] || null;
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (file && file.size > 10 * 1024 * 1024) {
        event.target.value = "";
        state.bossResumeImage = null;
        log("warn", "图片简历不能超过 10 MB");
        return;
      }
      if (file && !validTypes.includes(file.type)) {
        event.target.value = "";
        state.bossResumeImage = null;
        log("warn", "图片简历仅支持 JPG、PNG、GIF 或 WebP 格式");
        return;
      }
      state.bossResumeImage = file;
      const name = cachedPanel.querySelector('[data-role="boss-resume-image-name"]');
      if (name) name.textContent = file?.name || "请选择图片简历（仅在当前页面有效）";
      return;
    }
    saveConfig(collectFormConfig(), true);
  }

  function handlePanelClick(event) {
    const target =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    if (!target) return;
    event.preventDefault();
    const action = target.getAttribute("data-action");

    if (action === "clear-boss-resume") {
      state.bossResumeImage = null;
      renderPanel();
      return;
    }

    if (action === "toggle-collapse") {
      state.collapsed = !state.collapsed;
      renderPanel();
      return;
    }

    if (action === "start") {
      saveConfig(collectFormConfig());
      startApply().catch((error) => {
        state.running = false;
        state.stopping = false;
        state.current = "异常停止";
        log("error", `运行异常：${error.message || error}`, error);
      });
      return;
    }

    if (action === "stop") {
      stopApply();
      return;
    }
  }

  // =====================================================================
  // 通用运行流程
  // =====================================================================

  function getJobUniqueKey(job) {
    if (job?.key) return job.key;
    // Boss 保持原有 key 结构，兼容历史记录。
    return [
      job.securityId,
      job.encryptJobId,
      job.lid,
      job.jobName,
      job.brandName,
    ]
      .map((item) => normalizeText(item))
      .join("|");
  }

  function resetRunCounters() {
    state.scanned = 0;
    state.matched = 0;
    state.applied = 0;
    state.skipped = 0;
    state.failed = 0;
    state.platformRemainingQuota = null;
    state.current = "准备开始";
    state.processedKeys = new Set();
  }

  async function startApply(options = {}) {
    if (state.running) return;
    const adapter = getAdapter();
    if (!adapter || !adapter.isListPage()) {
      log(
        "warn",
        `请先打开 ${adapter?.label || "招聘网站"} 的职位列表页面，例如 ${adapter?.exampleUrl || ""}`,
      );
      return;
    }

    let login;
    try {
      login = adapter.ensureLogin();
    } catch (error) {
      login = { ok: false, reason: `登录状态检查失败：${error.message || error}` };
    }
    if (!login.ok) {
      log("error", login.reason || "登录状态不可用，请先登录。");
      return;
    }

    const history = loadHistory();
    if (history.dailyCount >= getDailyLimit(adapter)) {
      log("warn", `已达每日上限（${getDailyLimit(adapter)} 次）`);
      return;
    }

    const resume = options.resume || null;
    state.running = true;
    state.stopping = false;

    if (resume) {
      state.scanned = Number(resume.scanned) || 0;
      state.matched = Number(resume.matched) || 0;
      state.applied = Number(resume.applied) || 0;
      state.skipped = Number(resume.skipped) || 0;
      state.failed = Number(resume.failed) || 0;
      state.platformRemainingQuota = null;
      state.processedKeys = new Set(
        Array.isArray(resume.processedKeys) ? resume.processedKeys : [],
      );
      state.current = "继续上次任务";
      log(
        "success",
        `已恢复上次任务：已成功 ${state.applied}，跳过 ${state.skipped}，失败 ${state.failed}`,
      );
    } else {
      resetRunCounters();
      log("success", `开始自动投递（${adapter.label}）`);
    }

    let applySession;
    try {
      applySession = adapter.createApplySession?.();
      if (adapter.createApplySession && !applySession) {
        state.current = "无法打开投递页面";
        log("error", "浏览器阻止了投递页面，请允许本站弹出窗口后重试。");
        return;
      }
      await runApplyLoop(adapter, applySession);
    } finally {
      adapter.closeApplySession?.(applySession);
      state.running = false;
      state.stopping = false;
      state.current = state.current || "已结束";
      clearResumeState();
      log(
        "success",
        `任务结束：扫描 ${state.scanned}，匹配 ${state.matched}，成功 ${state.applied}，跳过 ${state.skipped}，失败 ${state.failed}`,
      );
      notify(
        `${adapter.label} 自动投递助手`,
        `任务结束：成功 ${state.applied} 条`,
      );
      renderPanel();
    }
  }

  function stopApply() {
    if (!state.running) return;
    state.stopping = true;
    state.current = "正在停止，等待当前请求结束";
    log("warn", "已请求停止");
    renderPanel();
  }

  async function runApplyLoop(adapter, applySession) {
    let pageRound = 1;

    while (!state.stopping) {
      state.current = `读取第 ${pageRound} 页职位`;
      renderPanel();
      const jobs = await collectJobsWithWait(adapter);
      if (jobs.length === 0) {
        if (adapter.getCards().length === 0) {
          log("warn", "当前页未找到可读取的职位卡片。");
        } else {
          log("debug", "当前页职位均已处理。");
        }
      }

      for (const job of jobs) {
        if (state.stopping) break;
        if (state.applied >= config.maxApplyCount) {
          state.current = "达到单次上限";
          return;
        }

        const history = loadHistory();
        if (history.dailyCount >= getDailyLimit(adapter)) {
          state.current = "已达每日上限";
          log("warn", `已达每日上限（${getDailyLimit(adapter)} 次）`);
          return;
        }

        await handleOneJob(job, adapter, applySession);
        saveResumeState();
      }

      if (state.stopping) break;
      if (state.applied >= config.maxApplyCount) {
        state.current = "达到单次上限";
        return;
      }
      if (!config.autoNextPage) {
        state.current = "当前页处理完成（未开启自动翻页）";
        return;
      }

      const moved = await adapter.nextPage();
      if (!moved) {
        state.current = "没有更多职位";
        return;
      }

      saveResumeState({ phase: "pagination" });
      pageRound += 1;
      await sleep(config.pageDelaySec * 1000);
    }

    // 平台限额/登录风控也会设置 stopping，保留其具体原因，不要覆盖成“手动停止”。
    if (state.current === "正在停止，等待当前请求结束") {
      state.current = "已手动停止";
    }
  }

  async function collectJobsWithWait(adapter) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const cards = adapter.getCards();
      if (cards.length > 0) {
        const jobs = cards
          .map((card, index) => adapter.buildJob(card, index))
          .filter(Boolean);
        return dedupeJobs(jobs).filter(
          (job) => !state.processedKeys.has(getJobUniqueKey(job)),
        );
      }
      await sleep(500);
    }
    return [];
  }

  function dedupeJobs(jobs) {
    const result = [];
    const seen = new Set();
    for (const job of jobs) {
      const key = getJobUniqueKey(job);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(job);
    }
    return result;
  }

  async function handleOneJob(job, adapter, applySession) {
    const key = getJobUniqueKey(job);
    state.processedKeys.add(key);
    state.scanned += 1;
    state.current = formatJob(job);
    renderPanel();

    try {
      // 详情页只用于「职位详情关键词」过滤；没有配置关键词时没必要抓取
      // （智联详情页单页 1.5MB 左右，逐个抓取会显著拖慢投递速度；前程无忧已从列表数据读取 JD）。
      const needJobDetail =
        config.fetchDetail &&
        (splitKeywords(config.includeDescriptionKeywords).length > 0 ||
          splitKeywords(config.excludeDescriptionKeywords).length > 0);
      const detail = needJobDetail
        ? await safeFetchJobDetail(job, adapter)
        : null;
      const filter = applyFilters(job, detail, adapter);
      if (!filter.ok) {
        state.skipped += 1;
        log("warn", `跳过【${formatJob(job)}】：${filter.reason}`);
        // 猎聘需要额外请求详情页做关键词过滤，跳过时稍作停顿，避免请求过密。
        if (adapter.id === "liepin") {
          await sleep(randomBetween(500, 1200));
        }
        return;
      }

      state.matched += 1;

      const result = await adapter.apply(job, applySession);
      if (result.ok || result.skipped || result.limited) {
        if (Number.isFinite(result.remainingQuota)) {
          state.platformRemainingQuota = result.remainingQuota;
          renderPanel();
        }
      }
      if (result.ok) {
        state.applied += 1;
        recordApplied(job);
        if (result.softSuccess) {
          const quotaNote = Number.isFinite(result.remainingQuota)
            ? `（平台剩余 ${result.remainingQuota} 次）`
            : "";
          log(
            "success",
            `投递成功${quotaNote}【${formatJob(job)}】：${result.message || ""}`,
          );
        } else {
          log("success", `投递成功【${formatJob(job)}】`);
        }
        if (result.imageResume) {
          log(
            result.imageResume.ok ? "success" : "warn",
            `图片简历${result.imageResume.ok ? "发送成功" : "发送失败"}【${formatJob(job)}】：${result.imageResume.message}`,
          );
        }
        if (
          Number.isFinite(result.remainingQuota) &&
          result.remainingQuota <= 3
        ) {
          log("warn", `平台沟通机会仅剩 ${result.remainingQuota} 次`);
        }
      } else if (result.skipped) {
        state.skipped += 1;
        log(
          "warn",
          `跳过【${formatJob(job)}】：${result.message || "无需重复投递"}`,
        );
        await sleep(randomBetween(500, 1200));
        return;
      } else if (result.limited) {
        state.failed += 1;
        log(
          "error",
          `平台限制或需人工处理【${formatJob(job)}】：${result.message}`,
        );
        state.current = result.message || "平台限制";
        state.stopping = true;
        return;
      } else {
        state.failed += 1;
        log("error", `投递失败【${formatJob(job)}】：${result.message}`);
      }

      await sleepHumanDelay();
    } catch (error) {
      state.failed += 1;
      log(
        "error",
        `处理失败【${formatJob(job)}】：${error.message || error}`,
        error,
      );
      await sleepHumanDelay();
    } finally {
      renderPanel();
    }
  }

  async function safeFetchJobDetail(job, adapter) {
    try {
      return await adapter.fetchDetail(job);
    } catch (error) {
      log(
        "warn",
        `获取详情失败，继续使用基础信息过滤【${formatJob(job)}】：${error.message || error}`,
      );
      return null;
    }
  }

  function applyFilters(job, detail, adapter) {
    if (!adapter.canApply(job)) {
      return { ok: false, reason: adapter.noApplyReason || "缺少投递所需字段" };
    }

    if (job.contact) return { ok: false, reason: "已经沟通过或已投递" };

    if (config.skipAppliedHistory && hasAppliedToday(job)) {
      return { ok: false, reason: "今日历史中已投递" };
    }

    if (config.skipHeadhunter && job.isHeadhunter) {
      return { ok: false, reason: "过滤猎头" };
    }

    if (config.onlyOnlineBoss && adapter.supportsOnlineFilter) {
      if (!job.recruiterOnline) {
        return { ok: false, reason: "无法确认招聘者在线" };
      }
    }

    const platformSkip = adapter.shouldSkip?.(job, detail);
    if (platformSkip?.skip) {
      return { ok: false, reason: platformSkip.reason };
    }

    const includeDesc = splitKeywords(config.includeDescriptionKeywords);
    const excludeDesc = splitKeywords(config.excludeDescriptionKeywords);
    if (includeDesc.length || excludeDesc.length) {
      const text = fuzzyText(job, detail);
      if (!textHasInclude(text, includeDesc))
        return { ok: false, reason: "岗位详情不包含指定关键词" };
      if (excludeDesc.length && textHasAny(text, excludeDesc))
        return { ok: false, reason: "岗位详情命中排除关键词" };
    }

    return { ok: true, reason: "" };
  }

  function formatJob(job) {
    const title = normalizeText(job?.jobName) || "未知职位";
    const company = normalizeText(job?.brandName) || "未知公司";
    const salary = normalizeText(job?.salaryDesc);
    return `${title} - ${company}${salary ? ` - ${salary}` : ""}`;
  }

  // =====================================================================
  // Boss 直聘
  // =====================================================================

  function isBossJobPage() {
    return /https:\/\/www\.zhipin\.com\/web\/geek\/(job|jobs|job-recommend|overseas)/.test(
      location.href,
    );
  }

  function ensureBossLogin() {
    const token = getCookie("bst");
    if (!token) {
      return {
        ok: false,
        reason: "未读取到登录 token。请先在浏览器里自行登录 Boss 直聘。",
      };
    }
    if (config.bossImageResumeEnabled && !state.bossResumeImage) {
      return { ok: false, reason: "已启用图片简历发送，请先选择图片简历。" };
    }
    return { ok: true };
  }

  function getBossJobCardElements() {
    return collectCardsBySelectors(BOSS_SELECTORS.jobCards, {
      preferVisible: false,
    });
  }

  function buildBossJobDetail(card, index) {
    const raw = pickJobData(card) || {};
    const text = normalizeText(card.innerText || card.textContent || "");
    const jobName =
      pickFirstString(raw, ["jobName", "jobTitle", "title", "positionName"]) ||
      pickDomText(card, [
        ".job-name",
        ".job-title",
        ".job-card-left .job-name",
      ]);
    const brandName =
      pickFirstString(raw, [
        "brandName",
        "companyName",
        "brandFullName",
        "companyFullName",
      ]) ||
      pickDomText(card, [
        ".company-name",
        ".company-text .name",
        ".company-info .name",
      ]);
    const salaryDesc =
      pickFirstString(raw, ["salaryDesc", "salary", "salaryName"]) ||
      pickDomText(card, [".salary", ".job-salary", ".salary-desc"]);

    const job = {
      platform: "boss",
      index,
      card,
      raw,
      rawText: text,
      securityId: pickFirstString(raw, ["securityId", "securityID"]),
      encryptJobId: pickFirstString(raw, [
        "encryptJobId",
        "jobId",
        "encryptJobID",
      ]),
      lid: pickFirstString(raw, ["lid", "listId"]),
      encryptBossId: pickFirstString(raw, [
        "encryptBossId",
        "bossId",
        "encryptBossID",
      ]),
      jobName,
      brandName,
      salaryDesc,
      cityName: pickFirstString(raw, ["cityName", "city"]),
      areaDistrict: pickFirstString(raw, [
        "areaDistrict",
        "districtName",
        "area",
      ]),
      businessDistrict: pickFirstString(raw, [
        "businessDistrict",
        "businessArea",
      ]),
      brandScaleName: pickFirstString(raw, [
        "brandScaleName",
        "companyScaleName",
        "scaleName",
      ]),
      brandIndustry: pickFirstString(raw, ["brandIndustry", "industryName"]),
      jobLabels: raw.jobLabels || raw.labels || raw.skills || [],
      skills: raw.skills || [],
      detailUrl:
        pickFirstString(raw, ["detailUrl", "jobUrl", "url"]) ||
        card.querySelector('a[href*="/job_detail/"]')?.href ||
        "",
      contact: Boolean(
        raw.contact ||
        raw.friendStatus === 1 ||
        raw.friendStatus === "1" ||
        /已沟通|继续沟通/.test(text),
      ),
      bossOnline: pickBoolean(raw, ["bossOnline", "online", "isOnline"]),
      goldHunter: raw.goldHunter,
    };

    job.isHeadhunter =
      job.goldHunter === 1 ||
      job.goldHunter === "1" ||
      /猎头/.test(job.rawText);
    job.recruiterOnline =
      job.bossOnline === true || /在线/.test(job.rawText);

    if (!job.jobName && !job.brandName && !job.securityId) return null;
    return job;
  }

  function pickJobData(card) {
    const candidates = [];
    const directKeys = [
      "__vue__",
      "__vue_app__",
      "__vueParentComponent",
      "_vnode",
    ];

    for (const key of directKeys) {
      if (card[key]) candidates.push(card[key]);
    }

    if (card.__vue__) {
      candidates.push(
        card.__vue__.data,
        card.__vue__._data,
        card.__vue__._props,
        card.__vue__.$props,
      );
    }
    if (card.__vueParentComponent) {
      candidates.push(
        card.__vueParentComponent.props,
        card.__vueParentComponent.ctx,
        card.__vueParentComponent.setupState,
        card.__vueParentComponent.proxy,
      );
    }

    return findJobLikeObject(candidates);
  }

  function findJobLikeObject(seedList) {
    return findObjectByPredicate(seedList, looksLikeJobData, 4);
  }

  function looksLikeJobData(obj) {
    if (!obj || typeof obj !== "object") return false;
    const hasApplyFields = Boolean(
      (obj.securityId || obj.securityID) &&
      (obj.encryptJobId || obj.jobId) &&
      obj.lid,
    );
    const hasJobText = Boolean(
      obj.jobName ||
      obj.jobTitle ||
      obj.title ||
      obj.brandName ||
      obj.companyName,
    );
    return hasApplyFields || (hasJobText && Boolean(obj.securityId || obj.lid));
  }

  async function fetchBossJobDetail(job) {
    if (!job.securityId || !job.lid) {
      log("debug", `缺少详情字段，跳过详情请求：${formatJob(job)}`);
      return null;
    }

    const params = new URLSearchParams({
      lid: job.lid,
      securityId: job.securityId,
      sessionId: "",
    });
    const response = await fetch(
      `/wapi/zpgeek/job/card.json?${params.toString()}`,
      {
        method: "GET",
        credentials: "include",
        headers: buildBossHeaders(),
      },
    );
    const data = await parseResponse(response);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (
      data &&
      typeof data === "object" &&
      data.code !== undefined &&
      data.code !== 0
    ) {
      throw new Error(data.message || `接口返回 code=${data.code}`);
    }

    return data?.zpData?.jobCard || data?.zpData || data?.data || null;
  }

  function bossShouldSkip(_job, detail) {
    if (config.activeWithinDays > 0 && detail?.activeTimeDesc) {
      const activeDays = parseActiveDays(detail.activeTimeDesc);
      if (Number.isFinite(activeDays) && activeDays > config.activeWithinDays) {
        return { skip: true, reason: "boss活跃度未达标,已过滤" };
      }
    }

    if (detail?.friendStatus === 1 || detail?.friendStatus === "1") {
      return { skip: true, reason: "详情接口显示已沟通" };
    }

    return { skip: false, reason: "" };
  }

  function parseActiveDays(value) {
    const text = String(value || "");
    if (!text || /刚刚|今日|今天|当前|在线|分钟|小时/.test(text)) return 0;

    let match = text.match(/(\d+)\s*日/);
    if (match) return Number(match[1]);

    match = text.match(/(\d+)\s*天/);
    if (match) return Number(match[1]);

    match = text.match(/(\d+)\s*周/);
    if (match) return Number(match[1]) * 7;

    match = text.match(/(\d+)\s*月/);
    if (match) return Number(match[1]) * 30;

    match = text.match(/(\d+)\s*年/);
    if (match) return Number(match[1]) * 365;

    if (/周/.test(text)) return 7;
    if (/月/.test(text)) return 30;
    if (/年/.test(text)) return 365;
    return Number.POSITIVE_INFINITY;
  }

  async function applyBossJob(job, extraParams = {}) {
    const params = new URLSearchParams({
      securityId: job.securityId,
      jobId: job.encryptJobId,
      lid: job.lid,
      ...extraParams,
    });

    const response = await fetch(
      `/wapi/zpgeek/friend/add.json?${params.toString()}`,
      {
        method: "POST",
        credentials: "include",
        headers: buildBossHeaders(),
      },
    );
    const data = await parseResponse(response);
    debugBossResponse(job, response, data);

    if (!response.ok) {
      return {
        ok: false,
        limited: response.status === 403 || response.status === 429,
        message: `HTTP ${response.status}`,
        raw: data,
      };
    }

    const message = extractBossMessage(data);
    const chatRemindDialog = getChatRemindDialog(data);
    const chatRemindText = chatRemindDialog
      ? dialogToText(chatRemindDialog)
      : "";
    const fullMessage = normalizeText(
      [message, chatRemindText].filter(Boolean).join("；"),
    );
    const remainingQuota = parseRemainingQuota(fullMessage);

    if (
      data?.code === 0 ||
      data?.message === "Success" ||
      message === "Success"
    ) {
      const result = {
        ok: true,
        message: message || "Success",
        remainingQuota,
        raw: data,
      };
      if (config.bossImageResumeEnabled) {
        result.imageResume = await sendBossImageResume(job);
      }
      return result;
    }

    const limited = isHardLimitMessage(fullMessage);
    const isChatRemind =
      Boolean(chatRemindDialog) || /开聊提醒/.test(fullMessage);
    if (isChatRemind && !limited) {
      const reminder = chatRemindText || message || "开聊提醒";
      if (extraParams.cid) {
        return {
          ok: false,
          limited: true,
          message: `已确认开聊提醒，平台仍未放行：${reminder}`,
          remainingQuota,
          raw: data,
        };
      }
      if (remainingQuota > 0) {
        // 每日沟通满 120 位后 Boss 会先弹「开聊提醒」；网页端点「好」时上报埋点，再带 cid=1 重新发起沟通。
        await fetch("/wapi/zpCommon/actionLog/geek/chatremind.json", {
          method: "POST",
          credentials: "include",
          headers: buildBossHeaders(),
          body: new URLSearchParams({
            action: "addf-limit-popup-c",
            ba: chatRemindDialog?.ba || "",
          }),
        }).catch(() => {});
        await sleep(randomBetween(1000, 2000));
        const confirmed = await applyBossJob(job, { cid: 1 });
        return confirmed.ok
          ? { ...confirmed, remainingQuota: remainingQuota - 1 }
          : confirmed;
      }
      return {
        ok: false,
        skipped: true,
        message: `开聊提醒未确认：${reminder}`,
        raw: data,
      };
    }

    return {
      ok: false,
      limited,
      message: fullMessage || `接口返回 code=${data?.code}`,
      raw: data,
    };
  }

  async function sendBossImageResume(job) {
    const file = state.bossResumeImage;
    if (!file) return { ok: false, message: "未选择图片简历" };

    let detailUrl;
    try {
      detailUrl = new URL(job.detailUrl, location.origin);
    } catch (error) {
      return { ok: false, message: "缺少有效的职位详情页地址" };
    }
    if (
      detailUrl.origin !== location.origin ||
      !detailUrl.pathname.startsWith("/job_detail/")
    ) {
      return { ok: false, message: "缺少有效的职位详情页地址" };
    }

    const frame = document.createElement("iframe");
    frame.src = detailUrl.href;
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;left:0;top:0;width:1280px;height:900px;border:0;opacity:0.01;z-index:-2147483647;pointer-events:none;";
    document.body.appendChild(frame);

    try {
      await new Promise((resolve) => {
        frame.addEventListener("load", resolve, { once: true });
        setTimeout(resolve, 10000);
      });
      let targetDoc = frame.contentDocument;
      if (!targetDoc) return { ok: false, message: "无法读取职位聊天页面" };

      const findUploadControl = () =>
        [...(targetDoc?.querySelectorAll(
          'div.btn-sendimg[aria-label="发送图片"], div[aria-label="发送图片"].btn-sendimg, [aria-label="发送图片"]',
        ) || [])].find((control) =>
          control.querySelector('input[type="file"]'),
        );
      const findMessagesRoot = () =>
        targetDoc?.querySelector(".chat-message .im-list, .chat-record");
      const findChatButton = (pattern) =>
        [...(targetDoc?.querySelectorAll("a.btn-startchat, a.op-btn-chat") || [])].find(
          (button) =>
            pattern.test(
              normalizeText(button.innerText || button.textContent || ""),
            ),
        );
      const waitForChat = async () => {
        for (let attempt = 0; attempt < 30; attempt += 1) {
          targetDoc = frame.contentDocument;
          uploadControl = findUploadControl();
          uploadInput = uploadControl?.querySelector('input[type="file"]');
          messagesRoot = findMessagesRoot();
          if (uploadInput && messagesRoot) return true;
          await sleep(500);
        }
        return false;
      };

      let uploadControl = findUploadControl();
      let uploadInput = uploadControl?.querySelector('input[type="file"]');
      let messagesRoot = findMessagesRoot();
      if (!uploadInput || !messagesRoot) {
        const chatButton = findChatButton(/立即沟通|继续沟通/);
        if (!chatButton) {
          return { ok: false, message: "职位详情页未找到沟通入口" };
        }
        chatButton.click();
        await waitForChat();
      }

      if (!uploadInput) {
        targetDoc?.querySelector("i.icon-close")?.click();
        await sleep(500);
        const fullChatButton = findChatButton(/继续沟通/);
        if (fullChatButton) {
          fullChatButton.click();
          await waitForChat();
        }
      }
      if (!uploadInput) {
        return { ok: false, message: "职位聊天未提供图片上传控件" };
      }
      if (!messagesRoot) {
        return { ok: false, message: "无法定位聊天消息列表" };
      }

      const imageMessages = () =>
        [...(messagesRoot?.querySelectorAll("li.message-item.item-myself") || [])].filter(
          (item) =>
            item.querySelector(
              ".message-content img, .message-content [class*=image-content], .message-content [class*=message-image], .message-content [class*=message-img], .message-content [style*=background-image]",
            ),
        );
      const previousCount = imageMessages().length;
      uploadControl = findUploadControl();
      if (!uploadControl || uploadControl.querySelector('input[type="file"]') !== uploadInput) {
        return { ok: false, message: "未找到 Boss 的发送图片按钮" };
      }
      const transfer = new targetDoc.defaultView.DataTransfer();
      transfer.items.add(file);
      uploadInput.files = transfer.files;
      uploadInput.dispatchEvent(
        new targetDoc.defaultView.Event("input", { bubbles: true }),
      );
      uploadInput.dispatchEvent(
        new targetDoc.defaultView.Event("change", { bubbles: true }),
      );
      await sleep(1000);
      let stableSeconds = 0;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await sleep(1000);
        targetDoc = frame.contentDocument;
        messagesRoot = findMessagesRoot();
        if (!messagesRoot) continue;
        const sentImages = imageMessages();
        const message = sentImages[sentImages.length - 1];
        if (sentImages.length <= previousCount || !message) {
          stableSeconds = 0;
          continue;
        }

        const text = normalizeText(message.innerText || message.textContent || "");
        const classes = [message, ...message.querySelectorAll("*")]
          .map((element) =>
            typeof element.className === "string" ? element.className : "",
          )
          .join(" ")
          .toLowerCase();
        if (
          /上传失败|发送失败|点击重试/.test(text) ||
          /upload-fail|upload-error|send-fail|send-error|message-fail/.test(
            classes,
          )
        ) {
          return { ok: false, message: "Boss 页面显示图片发送失败" };
        }
        if (
          /上传中|发送中/.test(text) ||
          /uploading|sending|upload-progress|send-progress/.test(classes)
        ) {
          stableSeconds = 0;
          continue;
        }
        stableSeconds += 1;
        if (stableSeconds >= 3) {
          return { ok: true, message: "图片简历已发送" };
        }
      }
      return { ok: false, message: "等待 60 秒仍未确认图片发送完成" };
    } catch (error) {
      return { ok: false, message: `图片发送异常：${error.message || error}` };
    } finally {
      frame.remove();
    }
  }

  function buildBossHeaders() {
    const token = getCookie("bst");
    const headers = {
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
    };
    if (token) headers.Zp_token = token;
    return headers;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      return { code: response.ok ? 0 : response.status, message: text };
    }
  }

  function extractBossMessage(data) {
    if (!data) return "";
    const dialogText = dialogToText(getChatRemindDialog(data));
    return normalizeText(
      dialogText ||
        data.message ||
        data.msg ||
        data?.zpData?.message ||
        data?.zpData?.bizData?.toast ||
        data?.zpData?.toast ||
        "",
    );
  }

  function getChatRemindDialog(data) {
    if (!data || typeof data !== "object") return null;
    return (
      data?.zpData?.bizData?.chatRemindDialog ||
      data?.zpData?.chatRemindDialog ||
      data?.chatRemindDialog ||
      null
    );
  }

  function dialogToText(dialog) {
    if (!dialog || typeof dialog !== "object") return "";
    const values = [];
    const visit = (value, depth = 0) => {
      if (value == null || depth > 3) return;
      if (typeof value === "string" || typeof value === "number") {
        const text = normalizeText(value);
        if (text) values.push(text);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => visit(item, depth + 1));
        return;
      }
      if (typeof value === "object") {
        for (const key of [
          "title",
          "content",
          "subTitle",
          "desc",
          "text",
          "buttonText",
          "confirmText",
          "cancelText",
        ]) {
          if (Object.prototype.hasOwnProperty.call(value, key))
            visit(value[key], depth + 1);
        }
      }
    };
    visit(dialog);
    return [...new Set(values)].join("；");
  }

  function parseRemainingQuota(message) {
    const text = normalizeText(message || "");
    const match = text.match(/(?:还剩|剩余)\s*(\d+)\s*次/);
    return match ? Number(match[1]) : null;
  }

  function isHardLimitMessage(message) {
    const text = message || "";
    const remainingQuota = parseRemainingQuota(text);
    if (remainingQuota === 0) return true;
    return /上限|今日沟通人数已达|频繁|验证|验证码|登录|失效|安全|风控|异常|稍后|暂时无法|账号/.test(
      text,
    );
  }

  function debugBossResponse(job, response, data) {
    const message = extractBossMessage(data);
    if (
      !config.debug &&
      response.ok &&
      (data?.code === 0 || message === "Success")
    )
      return;
    console.groupCollapsed(
      `[${APP_ID}] 投递接口响应 ${response.status} ${data?.code ?? ""} ${formatJob(job)}`,
    );
    console.log("message:", message);
    console.log("chatRemindDialog:", getChatRemindDialog(data));
    console.log("raw:", data);
    console.groupEnd();
  }

  async function goBossNextPageOrScroll() {
    if (await scrollForMoreJobs("Boss")) return true;

    const nextIcon = document.querySelector(BOSS_SELECTORS.nextIcon);
    const nextButton =
      nextIcon?.closest("button, a, li, .btn, .page-next") ||
      nextIcon?.parentElement;
    if (
      nextButton &&
      !/disabled|disable/.test(nextButton.className || "") &&
      nextButton.getAttribute("aria-disabled") !== "true"
    ) {
      nextButton.click();
      log("debug", "已点击下一页");
      return true;
    }

    return false;
  }

  async function scrollForMoreJobs(label) {
    const scrollContainer = [
      ".job-list-container",
      ".job-list",
      ".recommend-job-list",
      ".job-recommend-result",
      ".recommend-result-inner",
      ".page-job-inner",
      // 智联新版拆分/内部滚动布局
      "[class*='jobs-list-sort-scroll']",
      "[class*='job-sort-scroll']",
      "[class*='job-list-panel']",
      "[class*='job-split-layout']",
      "[class*='joblist-box']",
    ]
      .map((selector) => document.querySelector(selector))
      .find(Boolean);

    if (scrollContainer) {
      const before = scrollContainer.scrollTop + scrollContainer.clientHeight;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
      await sleep(1000);
      const after = scrollContainer.scrollTop + scrollContainer.clientHeight;
      if (after > before + 20) {
        log("debug", `${label} 已滚动职位列表加载更多`);
        return true;
      }
    }

    const pageBefore = window.scrollY + window.innerHeight;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth",
    });
    await sleep(1000);
    const pageAfter = window.scrollY + window.innerHeight;
    if (pageAfter > pageBefore + 20) {
      log("debug", `${label} 已滚动页面加载更多`);
      return true;
    }

    return false;
  }

  // =====================================================================
  // 猎聘
  // =====================================================================

  function isLiepinListPage() {
    return /^https:\/\/www\.liepin\.com\/zhaopin/i.test(location.href);
  }

  function ensureLiepinLogin() {
    if (/passport\.liepin\.com|\/login/i.test(location.href)) {
      return { ok: false, reason: "请先在浏览器里自行登录猎聘。" };
    }

    const userEntry = document.querySelector(
      ".header-quick-menu-user, .user-info, [class*='user-info'], [class*='user-center'], [class*='user-avatar']",
    );
    if (userEntry) return { ok: true };

    const loginEntry = Array.from(
      document.querySelectorAll("a, button"),
    ).find((element) => {
      if (!isElementVisible(element)) return false;
      return /^(登录|登录\/注册|立即登录)$/.test(
        normalizeText(element.innerText || element.textContent || ""),
      );
    });

    if (loginEntry) {
      return { ok: false, reason: "未检测到猎聘登录状态，请先登录。" };
    }

    // 选择器可能随页面改版失效，无法确认时放行，点击后再根据弹窗判断。
    return { ok: true };
  }

  function getLiepinJobCardElements() {
    return collectCardsBySelectors(LIEPIN_SELECTORS.jobCards, {
      preferVisible: true,
      firstNonEmpty: true,
    });
  }

  function findLiepinJobLink(card) {
    return (
      card.querySelector('a[data-nick="job-detail-job-info"]') ||
      card.querySelector('a[href*="/job/"]') ||
      card.querySelector('a[href*="/a/"]') ||
      card.querySelector('a[href*="liepin.com/job"]') ||
      null
    );
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function parseLiepinCardExt(card) {
    const ext = card.getAttribute("data-tlg-ext");
    if (!ext) return {};
    for (const candidate of [ext, safeDecodeURIComponent(ext)]) {
      try {
        const data = JSON.parse(candidate);
        if (data && typeof data === "object") return data;
      } catch (error) {
        // try next candidate
      }
    }
    return {};
  }

  function extractLiepinJobId(card, link, extData = {}) {
    const href = link?.href || "";
    let match = href.match(/\/job\/(\d+)\.shtml/);
    if (match) return match[1];
    match = href.match(/\/a\/(\d+)\.shtml/);
    if (match) return match[1];

    if (extData.jobId) return String(extData.jobId);

    const directId =
      card.getAttribute("data-job-id") || card.getAttribute("data-id");
    if (directId) return directId;

    const ext = card.getAttribute("data-tlg-ext");
    if (ext) {
      const idMatch = ext.match(/jobId\\?":\\?"?(\d+)/);
      if (idMatch) return idMatch[1];
    }

    return "";
  }

  function inferLiepinCompany(lines, jobName) {
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/女士|先生|\bHR\b|招聘|猎头|经理|顾问/.test(line)) continue;
      const candidate = lines[index - 1];
      if (
        candidate &&
        candidate !== jobName &&
        !/[kK万]|薪|经验|本科|大专|硕士|博士/.test(candidate)
      ) {
        return candidate;
      }
    }
    return "";
  }

  function getLiepinActionButton(card) {
    if (!card) return null;

    // 只在本卡片容器内找按钮，避免向上放宽 scope 时混入相邻职位的按钮。
    // 优先使用岗位卡片容器；只有容器类名缺失时才退回 li。
    const container =
      card.closest(
        '[class*="jobCardPcContainer"], [class*="job-card-pc-container"]',
      ) ||
      card.closest("li") ||
      card;
    const sameContainer = (element) => {
      const elementContainer =
        element.closest(
          '[class*="jobCardPcContainer"], [class*="job-card-pc-container"]',
        ) ||
        element.closest("li") ||
        container;
      return elementContainer === container;
    };

    const scopes = [card];
    if (container !== card) scopes.push(container);

    for (const scope of scopes) {
      const matches = Array.from(
        scope.querySelectorAll("button, a, [role='button']"),
      )
        .map((element) => {
          const text = normalizeText(
            element.innerText || element.textContent || "",
          );
          const label = normalizeText(
            [
              element.getAttribute("aria-label"),
              element.getAttribute("title"),
              element.getAttribute("data-selector"),
            ]
              .filter(Boolean)
              .join(" "),
          );
          return { element, text, label };
        })
        .filter(
          (item) =>
            (item.text && LIEPIN_SELECTORS.actionLabels.test(item.text)) ||
            /聊一聊|继续聊|立即沟通|chat-chat/i.test(item.label),
        )
        .filter((item) => sameContainer(item.element));

      // 只使用真实可见且可点击的按钮。预渲染/隐藏模板里的「继续聊」不能被当成
      // 当前岗位的状态，否则会误判为“此前已沟通”。
      const visibleMatches = matches.filter(
        (item) =>
          isElementVisible(item.element) && !isDisabled(item.element),
      );
      if (!visibleMatches.length) continue;

      const button =
        visibleMatches.find((item) => /聊一聊/.test(item.text))?.element ||
        visibleMatches.find((item) => /立即沟通/.test(item.text))?.element ||
        visibleMatches.find((item) => /继续聊/.test(item.text))?.element ||
        visibleMatches.find((item) =>
          /聊一聊|继续聊|立即沟通|chat-chat/i.test(item.label),
        )?.element ||
        null;

      if (button) return button;
    }

    return null;
  }

  function findNearestLiepinChatButton(card) {
    const cardRect = card.getBoundingClientRect();
    const centerX = cardRect.left + cardRect.width / 2;
    const centerY = cardRect.top + cardRect.height / 2;
    const cardContainer =
      card.closest(
        "li, [class*='jobCardPcContainer'], [class*='job-card-pc-container']",
      ) || card;

    const candidates = Array.from(
      document.querySelectorAll("button, a, [role='button']"),
    )
      .filter((element) => isElementVisible(element) && !isDisabled(element))
      .map((element) => {
        // 只接受同一张卡片容器内的按钮，避免误点到相邻职位的“聊一聊”。
        const elementContainer =
          element.closest(
            "li, [class*='jobCardPcContainer'], [class*='job-card-pc-container']",
          ) || card;
        if (elementContainer !== cardContainer) return null;

        const text = normalizeText(
          element.innerText || element.textContent || "",
        );
        const label = normalizeText(
          [
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("data-selector"),
          ]
            .filter(Boolean)
            .join(" "),
        );
        if (
          !/聊一聊|继续聊|立即沟通/.test(text) &&
          !/聊一聊|继续聊|chat-chat/i.test(label)
        ) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        const nearCard =
          rect.left >= cardRect.left - 60 &&
          rect.right <= cardRect.right + 60 &&
          rect.top >= cardRect.top - 80 &&
          rect.bottom <= cardRect.bottom + 80;
        if (!nearCard) return null;

        return {
          element,
          distance: Math.hypot(
            rect.left + rect.width / 2 - centerX,
            rect.top + rect.height / 2 - centerY,
          ),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);

    return candidates[0]?.element || null;
  }

  function simulateLiepinHover(card) {
    const targets = [];
    const push = (element) => {
      if (element && !targets.includes(element)) {
        targets.push(element);
      }
    };

    const rect = card.getBoundingClientRect();
    const centerX = Math.min(
      Math.max(rect.left + rect.width / 2, 1),
      Math.max(window.innerWidth - 1, 1),
    );
    const centerY = Math.min(
      Math.max(rect.top + rect.height / 2, 1),
      Math.max(window.innerHeight - 1, 1),
    );

    push(card);
    push(card.parentElement);
    push(
      card.querySelector(
        '[class*="recruiter"], [class*="hr"], [class*="footer"], [class*="action"], [class*="operat"]',
      ),
    );
    try {
      push(document.elementFromPoint(centerX, centerY));
    } catch (error) {
      // ignore
    }

    for (const target of targets) {
      const init = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
        screenX: centerX,
        screenY: centerY,
      };
      const enterInit = { ...init, bubbles: false };
      for (const type of ["mouseover", "mousemove", "mouseenter"]) {
        try {
          target.dispatchEvent(
            new MouseEvent(type, type === "mouseenter" ? enterInit : init),
          );
        } catch (error) {
          // ignore
        }
      }
      if (typeof PointerEvent === "function") {
        for (const type of ["pointerover", "pointermove", "pointerenter"]) {
          try {
            target.dispatchEvent(
              new PointerEvent(type, type === "pointerenter" ? enterInit : init),
            );
          } catch (error) {
            // ignore
          }
        }
      }
    }
  }

  async function findLiepinActionButtonWithHover(card) {
    let button = getLiepinActionButton(card);
    if (button) return button;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      simulateLiepinHover(card);
      await sleep(300);
      button = getLiepinActionButton(card);
      if (button) return button;
    }

    return findNearestLiepinChatButton(card);
  }

  function buildLiepinJobDetail(card, index) {
    const link = findLiepinJobLink(card);
    const extData = parseLiepinCardExt(card);
    const lines = String(card.innerText || card.textContent || "")
      .split("\n")
      .map((line) => normalizeText(line))
      .filter(Boolean);
    const titleAttr =
      normalizeText(link?.getAttribute("title") || "") ||
      pickDomAttr(
        card,
        [
          '[data-nick="job-detail-job-info"] [title]',
          '[class*="jobTitleBox"] [title]',
        ],
        "title",
      );
    const jobName =
      titleAttr ||
      pickDomText(card, [
        '[class*="jobTitleBox"] .ellipsis-1',
        '[class*="jobTitleBox"]',
        '[class*="job-title"]',
        '[class*="jobTitle"]',
        ".job-title",
      ]) ||
      normalizeText(link?.innerText || link?.textContent || "") ||
      lines[0] ||
      "";
    const brandName =
      pickDomText(card, [
        '[class*="companyName"]',
        '[class*="company-name"]',
        '[class*="comp-name"]',
        '[data-nick="job-detail-company-info"] [class*="ellipsis-1"]',
      ]) ||
      inferLiepinCompany(lines, jobName) ||
      "";
    const salaryDesc =
      pickDomText(card, [
        '[class*="jobSalary"]',
        '[class*="job-salary"]',
        '[class*="salary"]',
      ]) ||
      normalizeText(extData.salary || "");
    const cityName =
      normalizeText(extData.city || extData.workArea || "") ||
      pickDomText(card, [
        '[class*="job-dq"]',
        '[class*="dq"]',
        '[class*="area"]',
      ]);
    const labels = Array.from(
      card.querySelectorAll(
        '[class*="jobLabelsBox"] span, [class*="job-labels"] span, .labels span',
      ),
    )
      .map((element) => normalizeText(element.innerText || element.textContent))
      .filter(Boolean)
      .slice(0, 30);
    const companyTags = Array.from(
      card.querySelectorAll(
        '[class*="companyTags"] span, [class*="company-tags"] span, [class*="company-tags"] li',
      ),
    )
      .map((element) => normalizeText(element.innerText || element.textContent))
      .filter(Boolean)
      .slice(0, 20);
    const recruiterText = pickDomText(card, [
      '[class*="recruiterInfo"]',
      '[class*="recruiter-info"]',
      '[class*="hrName"]',
      ".hr-name",
    ]);
    const rawText = normalizeText(card.innerText || card.textContent || "");
    const jobId = extractLiepinJobId(card, link, extData);
    const detailUrl = link
      ? toHttps(new URL(link.getAttribute("href"), location.origin).href)
      : jobId
        ? `https://www.liepin.com/job/${jobId}.shtml`
        : "";
    const actionButton = getLiepinActionButton(card);
    const actionText = normalizeText(
      actionButton?.innerText || actionButton?.textContent || "",
    );
    // 注意：卡片显示「继续聊」只代表会话已创建，不代表真正沟通过。
    // 点击失败的旧会话也会变成「继续聊」，因此不能据此直接跳过；
    // 是否已沟通要打开会话后按聊天记录判断（见 deliverLiepinGreetingInDocument）。
    const appliedMarker = Array.from(
      card.querySelectorAll("button, a, [role='button'], span"),
    ).find(
      (element) =>
        isElementVisible(element) &&
        /^(已沟通|已投递|聊过了|已招满)$/.test(
          normalizeText(element.innerText || element.textContent || ""),
        ),
    );
    const contact =
      /已沟通|已投递|聊过了|已招满/.test(actionText) || Boolean(appliedMarker);
    const onlineText = `${recruiterText} ${rawText}`;
    const recruiterOnline =
      /在线|刚刚活跃|今日活跃|分钟前活跃|小时前活跃/.test(onlineText) &&
      !/(\d+)\s*(天|周|月)前/.test(onlineText);

    if (!jobName && !brandName && !jobId) return null;

    return {
      platform: "liepin",
      index,
      card,
      raw: null,
      key: `liepin|${jobId || `${jobName}|${brandName}`}`,
      jobId,
      jobName,
      brandName,
      salaryDesc,
      cityName,
      jobLabels: labels,
      skills: labels,
      filterText: [rawText, labels.join(" "), companyTags.join(" ")]
        .filter(Boolean)
        .join(" "),
      rawText,
      detailUrl,
      // 猎聘职位类型：3/4/5/7 分别对应 ZQ/ZZ/RPO/ATS，前端不渲染“聊一聊”。
      jobKind: normalizeText(
        extData.jobKind || card.getAttribute("data-job-kind") || "",
      ),
      contact,
      isHeadhunter:
        /猎头/.test(companyTags.join(" ")) || /猎头/.test(rawText),
      recruiterOnline,
      recruiterName: recruiterText,
      actionAvailable: Boolean(actionButton),
    };
  }

  async function fetchLiepinJobDetail(job) {
    const includeDesc = splitKeywords(config.includeDescriptionKeywords);
    const excludeDesc = splitKeywords(config.excludeDescriptionKeywords);
    // 没有关键词过滤需求时不额外请求详情页，减少访问量。
    if (!includeDesc.length && !excludeDesc.length) return null;
    if (!job.detailUrl) return null;

    const response = await fetch(job.detailUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    if (/passport\.liepin\.com|\/login/i.test(response.url || "")) {
      throw new Error("登录状态可能已失效");
    }
    if (
      !/job-intro|job-detail/i.test(html) &&
      /passport\.liepin\.com|login-submit-btn|id="loginname"/i.test(html)
    ) {
      throw new Error("登录状态可能已失效");
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    const postDescription = pickDomText(doc, [
      'dd[data-selector="job-intro-content"]',
      ".job-intro-container .paragraph dd",
      ".job-intro-container",
      ".job-content",
      ".content-word",
    ]);
    const activeTimeDesc = pickDomText(doc, [
      "span.online.off",
      ".recruiter-info-box .online",
      ".recruiter-info-box",
    ]);

    return { postDescription, activeTimeDesc };
  }

  function deepQueryAll(root, selector) {
    const results = [];
    const seen = new Set();
    const visit = (scope) => {
      if (!scope || seen.has(scope) || seen.size >= 80) return;
      seen.add(scope);
      try {
        for (const element of scope.querySelectorAll(selector)) {
          results.push(element);
        }
      } catch (error) {
        // ignore
      }
      // 作用域自身可能就是 shadow host（例如 #im-c-entry 的 shadow root 里才是编辑器）。
      if (scope.shadowRoot) visit(scope.shadowRoot);
      let elements = [];
      try {
        elements = scope.querySelectorAll("*");
      } catch (error) {
        elements = [];
      }
      for (const element of elements) {
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(root);
    return results;
  }

  function isLiepinChatEditorCandidate(element, doc) {
    if (!element || !doc) return false;
    if (!isElementVisibleInDocument(element, doc)) return false;
    if (element.disabled || element.readOnly) return false;
    const hint = `${element.getAttribute("placeholder") || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("type") || ""}`;
    if (/搜索|查找|搜索联系人|search/i.test(hint)) return false;
    if (
      element.tagName === "INPUT" &&
      element.id !== "chat-input" &&
      !/消息|message/i.test(hint)
    ) {
      return false;
    }
    return true;
  }

  function findLiepinChatEditor(root, doc) {
    if (!root || !doc) return null;
    const candidates = deepQueryAll(root, LIEPIN_SELECTORS.chatEditor).filter(
      (element) => isLiepinChatEditorCandidate(element, doc),
    );

    // 官方聊天输入区自己就是最可靠的定位锚点；没有锚点时只在唯一候选上做判断，
    // 不猜第一个输入框（可能是侧栏/其它工具），避免把无关输入区当成当前会话。
    const official = candidates.find((element) =>
      element.closest(".im-ui-chat-input"),
    );
    if (official) return official;
    return candidates.length === 1 ? candidates[0] : null;
  }

  function readLiepinImState(doc) {
    if (!doc) {
      return { widgets: [], rootsSeen: 0, inaccessibleFrames: 0 };
    }
    const widgets = [];
    const editorIndex = new Map();
    const seenScopes = new Set();
    let rootsSeen = 0;
    let inaccessibleFrames = 0;

    const safeQueryAll = (scope, selector) => {
      try {
        return Array.from(scope.querySelectorAll(selector));
      } catch (error) {
        return [];
      }
    };

    // 作用域可能是 Document、ShadowRoot（iframe / 自定义元素内部）或普通元素。
    const documentOf = (scope) => {
      if (!scope) return doc;
      if (scope.nodeType === 9) return scope;
      return scope.ownerDocument || doc;
    };

    const addWidget = (root) => {
      if (!root) return;
      const widgetDoc = documentOf(root);
      const editor = findLiepinChatEditor(root, widgetDoc);
      if (!editor) return;

      const heading = safeQueryAll(
        root,
        '[class*="header"], [class*="title"], [class*="conversation"] [class*="name"], [role="heading"]',
      )
        .filter(
          (element) =>
            isElementVisibleInDocument(element, widgetDoc) &&
            !String(element.className).includes("im-ui-basic-entry"),
        )
        .slice(0, 6)
        .map((element) =>
          normalizeText(element.innerText || element.textContent || "").slice(
            0,
            80,
          ),
        )
        .filter(Boolean)
        .filter((text, index, list) => list.indexOf(text) === index)
        .join("|");

      const messageSignature = safeQueryAll(
        root,
        ".im-ui-message-item-send, .im-ui-message-item-receive",
      )
        .slice(0, 8)
        .map((row) => normalizeText(row.innerText || row.textContent || ""))
        .join("|")
        .slice(0, 400);

      const widget = {
        root,
        editor,
        heading,
        signature: `${heading}||${messageSignature}`,
        doc: widgetDoc,
      };

      const existingIndex = editorIndex.get(editor);
      if (existingIndex === undefined) {
        editorIndex.set(editor, widgets.length);
        widgets.push(widget);
        return;
      }

      // 同一个输入框常常同时被外层挂载点（#im-c-entry）和内层弹窗匹配。
      // 只保留更内层的容器，避免把侧栏或其它会话的标题/消息算进当前会话。
      const existing = widgets[existingIndex];
      if (existing.root !== root && root.contains(existing.root)) return;
      widgets[existingIndex] = widget;
    };

    // 顶层 iframe 没有 IM 特征时不读内容；有特征或同源内容确实像聊天时才继续。
    const hasImContent = (scopeDoc) =>
      Boolean(safeQueryAll(scopeDoc, LIEPIN_SELECTORS.chatRoots.join(", ")).length) ||
      safeQueryAll(scopeDoc, LIEPIN_SELECTORS.chatEditor).some((editor) =>
        isLiepinChatEditorCandidate(editor, scopeDoc),
      );

    const inspectFrame = (frame, insideIm) => {
      if (!frame) return;
      if (!isElementVisibleInDocument(frame, documentOf(frame))) return;

      const hint = [
        frame.getAttribute("src") || "",
        frame.id || "",
        typeof frame.className === "string" ? frame.className : "",
      ].join(" ");
      const hinted = /(^|[/.:_-])(im|im-ui|chat|message|沟通|消息)/i.test(hint);

      let child = null;
      try {
        child = frame.contentDocument || frame.contentWindow?.document || null;
      } catch (error) {
        child = null;
      }
      if (!child) {
        // 只有 IM 作用域内或带 IM 特征的 iframe 才计入“无法读取”，广告/统计 iframe 不算。
        if (insideIm || hinted) inaccessibleFrames += 1;
        return;
      }
      // IM 作用域内的 iframe 一律视为聊天候选：真机把编辑器直接放在同源 iframe 中，
      // 里面不一定还有 IM 类名。顶层页面则只接受带 IM 特征或内容确实是聊天的 iframe。
      if (!insideIm && !hinted && !hasImContent(child)) return;
      inspectScope(child, true);
    };

    const inspectScope = (scope, insideIm = false) => {
      if (!scope || seenScopes.has(scope) || seenScopes.size >= 120) return;
      seenScopes.add(scope);

      // 进入 IM 挂载点 / 同源 iframe / shadow root 后，作用域本身可能就是一个聊天窗口：
      // 新版猎聘把编辑器直接挂在 #im-c-entry 的 shadow root 或 iframe 里，外层没有 IM 类名。
      if (insideIm) addWidget(scope);
      if (scope.shadowRoot) inspectScope(scope.shadowRoot, insideIm);

      for (const selector of LIEPIN_SELECTORS.chatRoots) {
        for (const root of safeQueryAll(scope, selector)) {
          rootsSeen += 1;
          inspectScope(root, true);
        }
      }

      // 类名改版兜底：直接按可见编辑器反推聊天容器。
      if (!insideIm && !widgets.length) {
        for (const editor of deepQueryAll(scope, LIEPIN_SELECTORS.chatEditor)) {
          if (!isLiepinChatEditorCandidate(editor, documentOf(scope))) continue;
          // 必须有聊天类祖先容器；页面正文/搜索框的父节点不能当成会话窗口。
          // 编辑器在 shadow root 中且外层没有聊天类名时，以 shadow host 作为容器。
          const chatAncestor = editor.closest(
            '[class*="chat"], [class*="im-ui"], [class*="message"], [id*="im-"]',
          );
          const rootNode = editor.getRootNode();
          const root =
            chatAncestor ||
            (rootNode && rootNode.nodeType === 11 ? rootNode : null);
          if (root) addWidget(root);
        }
      }

      // IM 作用域内继续穿透 open shadow root（聊天组件可能再包一层自定义元素）。
      if (insideIm) {
        for (const element of safeQueryAll(scope, "*")) {
          if (element.shadowRoot) inspectScope(element.shadowRoot, true);
        }
      }

      for (const frame of safeQueryAll(scope, "iframe")) {
        inspectFrame(frame, insideIm);
      }
    };

    inspectScope(doc);
    return { widgets, rootsSeen, inaccessibleFrames };
  }

  function collectLiepinImWidgets(doc) {
    return readLiepinImState(doc).widgets;
  }

  // editor -> { root, heading, signature }；用于判断点击后是否切换到了新会话。
  let liepinImSnapshot = new Map();

  function snapshotLiepinImWidgetsInDocument(docs) {
    const docList = Array.isArray(docs) ? docs : [docs];
    const widgets = [];
    const seenEditors = new Set();
    liepinImSnapshot = new Map();
    for (const doc of docList) {
      for (const widget of readLiepinImState(doc).widgets) {
        if (seenEditors.has(widget.editor)) continue;
        seenEditors.add(widget.editor);
        widgets.push(widget);
        liepinImSnapshot.set(widget.editor, {
          root: widget.root,
          heading: widget.heading,
          signature: widget.signature,
        });
      }
    }
    return widgets;
  }

  function liepinWidgetMatchesJob(widget, job) {
    if (!widget || !job || !widget.heading) return false;
    const heading = normalizeText(widget.heading);
    const names = [job.recruiterName, job.brandName, job.jobName]
      .map((name) => normalizeText(name))
      .filter((name) => name.length >= 2);
    return names.some((name) => heading.includes(name));
  }

  function isNewLiepinConversation(widget, previous) {
    // 输入框是新出现的（例如弹窗首次渲染）→ 新会话。
    if (!previous) return true;
    // 猎聘通常会复用同一个输入框/挂载点；这时以会话标题是否变化判断。
    // 标题为空时不猜测，避免把旧的常驻会话误判成本次点击打开的会话。
    return Boolean(widget.heading) && widget.heading !== previous.heading;
  }

  function findNewLiepinImWidgetInDocument(docs, job = null) {
    const docList = Array.isArray(docs) ? docs : [docs];
    const widgets = [];
    const seenEditors = new Set();
    for (const doc of docList) {
      for (const widget of readLiepinImState(doc).widgets) {
        if (seenEditors.has(widget.editor)) continue;
        seenEditors.add(widget.editor);
        widgets.push(widget);
      }
    }
    const targets = widgets.filter((widget) =>
      isNewLiepinConversation(widget, liepinImSnapshot.get(widget.editor)),
    );

    if (targets.length === 1) return targets[0];
    if (targets.length > 1) {
      // 多个候选时只接受能明确匹配本岗位招聘者/公司名的那个；
      // 无法唯一确定时拒绝猜测，避免把招呼语发给错误的招聘者。
      return targets.find((widget) => liepinWidgetMatchesJob(widget, job)) || null;
    }
    return null;
  }

  async function waitForNewLiepinImWidgetInDocument(
    docs,
    { card = null, job = null, timeoutMs = 15000 } = {},
  ) {
    // 支持传入函数：详情 iframe 点击后可能整页跳转，需要每轮重新取 contentDocument。
    const resolveDocs = () =>
      (Array.isArray(docs) ? docs : [docs])
        .map((item) => (typeof item === "function" ? item() : item))
        .filter(Boolean);
    const deadline = Date.now() + timeoutMs;
    let lastNoticeText = "";
    let transientSince = 0;
    // 平台拒绝开聊/暂时不可用时通常只弹一条提示，不会出现聊天窗口。
    // 快速失败并带上平台原文，比等 15 秒后误报“未检测到聊天输入框”更有用。
    const transientNotice =
      /聊天功能正在初始化|请稍后重试|请稍候再试|网络错误/;
    // IM 模块是懒加载的；“正在初始化”提示出现后通常很快恢复，
    // 先给 2.5 秒宽限，避免刚点完就把它当成最终失败。
    const TRANSIENT_GRACE_MS = 2500;
    const refusedNotice =
      /(无法|不能|不支持|暂不支持).{0,12}(开聊|沟通|聊天|发起)|请先(完善|上传|绑定|认证|登录)|完善.{0,6}简历|上传.{0,6}简历|该职位.{0,10}(下线|关闭|结束|暂停)|屏蔽.{0,6}公司|境外.{0,10}(授权|简历)|(沟通|开聊).{0,8}(上限|受限|限制)/;
    while (Date.now() < deadline) {
      const currentDocs = resolveDocs();
      const feedbackText = currentDocs
        .flatMap((doc) =>
          readLiepinFeedbackFromDocument(doc).map((item) => item.text),
        )
        .join("；");
      const noticeText = currentDocs
        .flatMap((doc) => readLiepinNoticeFromDocument(doc))
        .join("；");
      if (noticeText) lastNoticeText = noticeText;

      if (
        isLoginOrVerifyText(feedbackText) ||
        currentDocs.some((doc) => hasVisibleLoginSurfaceInDocument(doc))
      ) {
        return {
          error: {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "需要登录或人工验证",
          },
        };
      }
      if (isLimitText(feedbackText)) {
        return {
          error: {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "平台沟通次数受限",
          },
        };
      }
      if (noticeText && refusedNotice.test(noticeText)) {
        return {
          error: {
            ok: false,
            retryable: false,
            message: `平台未打开聊天窗口：${noticeText.slice(0, 160)}`,
          },
        };
      }

      // 先认已打开的会话：平台提示可能只是“打招呼成功”之类，不能盖过成功结果。
      const target = findNewLiepinImWidgetInDocument(currentDocs, job);
      if (target) return { widget: target };

      if (noticeText && transientNotice.test(noticeText)) {
        if (!transientSince) transientSince = Date.now();
        if (Date.now() - transientSince >= TRANSIENT_GRACE_MS) {
          return {
            error: {
              ok: false,
              retryable: true,
              transient: true,
              message: `平台提示：${noticeText.slice(0, 160)}`,
            },
          };
        }
      } else {
        transientSince = 0;
      }

      await sleep(300);
    }

    const states = resolveDocs().map((doc) => readLiepinImState(doc));
    const widgets = states.flatMap((state) => state.widgets);
    const inaccessibleFrames = states.reduce(
      (total, state) => total + state.inaccessibleFrames,
      0,
    );
    if (config.debug) {
      log("debug", `IM 新会话检测超时，当前检测到 ${widgets.length} 个会话`, {
        rootsSeen: states.reduce((total, state) => total + state.rootsSeen, 0),
        inaccessibleFrames,
        cardFound: Boolean(card && document.contains(card)),
        widgets: widgets.map((widget) => ({
          rootClass: String(widget.root.className || "").slice(0, 120),
          heading: widget.heading.slice(0, 80),
          editorTag: widget.editor.tagName,
          editorClass: String(widget.editor.className || "").slice(0, 120),
        })),
      });
    }

    const rootsSeen = states.reduce(
      (total, state) => total + state.rootsSeen,
      0,
    );
    const detail = widgets.length
      ? `（已检测到 ${widgets.length} 个聊天窗口，但没有切换到本岗位的新会话）`
      : inaccessibleFrames
        ? "（聊天窗口位于无法读取的 iframe 中）"
        : rootsSeen
          ? "（检测到 IM 容器，但未找到可编辑的聊天输入框）"
          : "（未检测到聊天输入框）";
    return {
      error: {
        ok: false,
        retryable: true,
        message: lastNoticeText
          ? `点击后未打开聊天窗口（平台提示：${lastNoticeText.slice(0, 160)}）`
          : `点击后未检测到新的聊天会话${detail}`,
      },
    };
  }

  function getLiepinChatDocRoot(doc) {
    const widgets = collectLiepinImWidgets(doc);
    return widgets[0]?.root || null;
  }

  function getLiepinSendButton(root, editor, doc) {
    if (!root || !doc) return null;
    const inputRoot = editor?.closest(".im-ui-chat-input");
    const scope = inputRoot && root.contains(inputRoot) ? inputRoot : root;
    const label = (element) =>
      normalizeText(element.innerText || element.textContent || "").replace(
        /\s+/g,
        "",
      );

    const official = deepQueryAll(
      scope,
      'button.im-ui-basic-send-btn, [role="button"].im-ui-basic-send-btn',
    ).filter(
      (element) =>
        isElementVisibleInDocument(element, doc) && !isDisabled(element),
    );
    if (official.length === 1) return official[0];
    if (official.length > 1) {
      // 多个官方按钮时只接受唯一一个文案为「发送」的按钮，不猜第一个。
      const labeled = official.filter((element) =>
        /^(发送|发送消息)$/.test(label(element)),
      );
      return labeled.length === 1 ? labeled[0] : null;
    }

    const fallback = deepQueryAll(
      scope,
      'button, a, [role="button"], input[type="submit"], [class*="send"], [class*="Send"]',
    ).filter(
      (element) =>
        isElementVisibleInDocument(element, doc) &&
        !isDisabled(element) &&
        /^(发送|发送消息)$/.test(label(element)),
    );
    return fallback.length === 1 ? fallback[0] : null;
  }

  function isLiepinDefaultGreeting(text) {
    return /^您好[！!，,。]?\s*我对贵公司发布的.{1,240}很感兴趣[，,。]\s*期待进一步了解[。.!！]?$/.test(
      normalizeText(text),
    );
  }

  function readLiepinChatState(root, doc) {
    if (!root || !doc) {
      return {
        editor: null,
        sendButton: null,
        editorText: "",
        outgoing: [],
        incoming: [],
        matching: [],
        defaultOutgoing: [],
        nonDefaultOutgoing: [],
      };
    }

    const editor = findLiepinChatEditor(root, doc);
    const sendButton = getLiepinSendButton(root, editor, doc);
    const needle = normalizeText(config.liepinGreeting || "");
    const outgoing = [];
    const incoming = [];
    const matching = [];
    const defaultOutgoing = [];
    const nonDefaultOutgoing = [];

    const rows = deepQueryAll(
      root,
      ".im-ui-message-item-send, .im-ui-message-item-receive",
    );
    for (const row of rows) {
      if (!isElementVisibleInDocument(row, doc)) continue;

      const hint = `${row.className} ${row.getAttribute("data-status") || ""}`;
      const hasErrorIcon = Array.from(
        row.querySelectorAll(
          '[class*="fail"], [class*="error"], [class*="loadingicon"]',
        ),
      ).some((element) => isElementVisibleInDocument(element, doc));
      if (
        hasErrorIcon ||
        /sending|pending|send-fail|send-error|message-fail|\bfailed\b/i.test(
          hint,
        )
      ) {
        continue;
      }

      const contentElement =
        row.querySelector(".im-ui-message-item-normal-message-wrapper")
          ?.firstElementChild || row;
      const content = normalizeText(
        contentElement.innerText || contentElement.textContent || "",
      );
      if (!content) continue;

      if (row.classList.contains("im-ui-message-item-send")) {
        outgoing.push(content);
        if (isLiepinDefaultGreeting(content)) defaultOutgoing.push(content);
        else nonDefaultOutgoing.push(content);
        if (needle && content.includes(needle)) matching.push(content);
      } else if (row.classList.contains("im-ui-message-item-receive")) {
        incoming.push(content);
      }
    }

    return {
      editor,
      sendButton,
      editorText: normalizeText(
        editor?.value ?? editor?.innerText ?? editor?.textContent ?? "",
      ),
      outgoing,
      incoming,
      matching,
      defaultOutgoing,
      nonDefaultOutgoing,
    };
  }

  function setLiepinEditorText(editor, doc, text) {
    if (!editor || !doc) return false;
    try {
      editor.focus();
      const isEditable =
        editor.isContentEditable ||
        editor.getAttribute("contenteditable") !== null;

      if (isEditable) {
        const selection = doc.getSelection();
        const range = doc.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);

        let inserted = false;
        try {
          inserted = doc.execCommand("insertText", false, text);
        } catch (error) {
          inserted = false;
        }
        if (!inserted) {
          editor.textContent = text;
          editor.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              data: text,
              inputType: "insertText",
            }),
          );
        }
      } else {
        const proto = Object.getPrototypeOf(editor);
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(editor, text);
        else editor.value = text;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        editor.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  async function deliverLiepinGreetingInDocument(doc, knownRoot = null) {
    if (!doc) return { ok: false, message: "无法访问聊天页面" };

    const greeting =
      normalizeText(config.liepinGreeting) ||
      DEFAULT_CONFIG.liepinGreeting;

    let root = knownRoot || null;
    if (root) {
      doc = root.ownerDocument || doc;
    } else {
      const waitDeadline = Date.now() + 10000;
      while (Date.now() < waitDeadline) {
        const feedbackText = readLiepinFeedbackFromDocument(doc)
          .map((item) => item.text)
          .join("；");

        if (
          isLoginOrVerifyText(feedbackText) ||
          hasVisibleLoginSurfaceInDocument(doc)
        ) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "需要登录或人工验证",
          };
        }
        if (isLimitText(feedbackText)) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "平台沟通次数受限",
          };
        }

        root = getLiepinChatDocRoot(doc);
        if (root) break;

        await sleep(300);
      }

      if (!root) {
        return {
          ok: false,
          message: "点击后未打开聊天窗口或未找到聊天输入框",
        };
      }
    }

    // 等待聊天记录 hydrate（平台自动招呼可能稍晚出现）。
    await sleep(1000);

    let state = readLiepinChatState(root, doc);
    if (state.matching.length) {
      return { ok: true, message: "招呼已发送" };
    }
    if (state.defaultOutgoing.length) {
      return { ok: true, message: "平台已自动发送默认招呼" };
    }
    if (state.incoming.length) {
      return {
        ok: false,
        skipped: true,
        message: "招聘方已有回复，属于此前已沟通，跳过重复打招呼",
      };
    }
    if (state.nonDefaultOutgoing.length) {
      // 刚建立的新会话里只有本人消息：通常是猎聘 App 里设置的自动招呼语
      // 被平台在点击「聊一聊」时自动发出。多条才更像是历史沟通记录。
      if (state.nonDefaultOutgoing.length === 1) {
        return { ok: true, message: "平台已自动发送招呼语" };
      }
      return {
        ok: false,
        skipped: true,
        message: "会话中已有多条本人消息，跳过重复打招呼",
      };
    }
    if (!state.editor) {
      if (config.debug) {
        log("debug", "聊天输入框未找到", {
          rootClass: String(root.className || "").slice(0, 120),
          rootTag: root.tagName,
        });
      }
      return { ok: false, message: "未找到聊天输入框" };
    }

    if (state.editorText) {
      // 输入框已有内容时，只允许发送平台默认招呼或当前招呼语，避免覆盖人工草稿。
      if (
        !isLiepinDefaultGreeting(state.editorText) &&
        !state.editorText.includes(greeting)
      ) {
        return {
          ok: false,
          message: "聊天输入框已有未发送内容，请人工核对",
        };
      }
    } else {
      setLiepinEditorText(state.editor, doc, greeting);
      await sleep(300);
      state = readLiepinChatState(root, doc);

      if (!state.editorText.includes(greeting)) {
        setLiepinEditorText(
          state.editor || findLiepinChatEditor(root, doc),
          doc,
          greeting,
        );
        await sleep(300);
        state = readLiepinChatState(root, doc);
      }
      if (!state.editorText.includes(greeting)) {
        return {
          ok: false,
          message: "招呼语填写失败，请人工核对",
        };
      }
    }

    let sendButton = state.sendButton;
    for (let attempt = 0; attempt < 10 && !sendButton; attempt += 1) {
      await sleep(200);
      state = readLiepinChatState(root, doc);
      sendButton = state.sendButton;
    }
    if (!sendButton) {
      if (config.debug) {
        log("debug", "发送按钮未找到", {
          editorTag: state.editor?.tagName,
          editorClass: String(state.editor?.className || "").slice(0, 120),
          rootClass: String(root.className || "").slice(0, 120),
        });
      }
      return { ok: false, message: "未找到发送按钮，请人工核对" };
    }

    // 点发送前再核对一次：避免平台在输入期间自动发了招呼，造成重复消息。
    state = readLiepinChatState(root, doc);
    if (state.matching.length || state.defaultOutgoing.length) {
      return { ok: true, message: "平台已自动发送默认招呼" };
    }
    if (state.nonDefaultOutgoing.length || state.incoming.length) {
      // 进入会话时这两种记录都不存在；填写期间新增只可能是平台自动发出的
      // 招呼语（或招聘方已回复），此时不应再补发，也不算重复打招呼。
      return { ok: true, message: "平台已自动发送招呼语" };
    }
    sendButton = state.sendButton || sendButton;

    const outgoingBefore = state.outgoing.length;
    try {
      sendButton.click();
    } catch (error) {
      return { ok: false, message: "点击发送按钮失败" };
    }

    let lastState = state;
    const confirmDeadline = Date.now() + 10000;
    while (Date.now() < confirmDeadline) {
      await sleep(300);

      const feedbackText = readLiepinFeedbackFromDocument(doc)
        .map((item) => item.text)
        .join("；");
      if (isLoginOrVerifyText(feedbackText)) {
        return {
          ok: false,
          limited: true,
          message: feedbackText.slice(0, 160) || "需要登录或人工验证",
        };
      }
      if (isLimitText(feedbackText)) {
        return {
          ok: false,
          limited: true,
          message: feedbackText.slice(0, 160) || "平台沟通次数受限",
        };
      }

      lastState = readLiepinChatState(root, doc);
      if (lastState.matching.length || lastState.defaultOutgoing.length) {
        return { ok: true, message: "招呼发送成功" };
      }
      if (
        lastState.outgoing.length > outgoingBefore &&
        !lastState.editorText
      ) {
        return { ok: true, message: "招呼发送成功" };
      }
    }

    if (config.debug) {
      log("debug", "招呼发送未确认", {
        outgoingBefore,
        outgoing: lastState.outgoing.length,
        matching: lastState.matching.length,
        defaultOutgoing: lastState.defaultOutgoing.length,
        incoming: lastState.incoming.length,
        editorText: lastState.editorText.slice(0, 80),
      });
    }

    return {
      ok: false,
      message: "招呼发送结果未确认，请人工核对（程序不会自动重发）",
    };
  }

  function closeLiepinChat(doc = document, root = null) {
    const scopeDoc = doc || document;
    let scope = root;
    if (!scope) {
      const widgets = collectLiepinImWidgets(scopeDoc);
      scope = widgets[0]?.root || scopeDoc;
    }

    const closeSelectors = [
      "div.__im_basic__contacts-title svg",
      ".im-ui-chat-container [class*='close']",
      ".im-ui-chat-modal-container [class*='close']",
      "[class*='im-ui'][class*='close']",
      "[class*='close-btn']",
      "[class*='closeBtn']",
      "[class*='close-icon']",
      "[aria-label*='关闭']",
      "[title*='关闭']",
      ".ant-modal-close",
    ];
    for (const selector of closeSelectors) {
      const element = deepQueryAll(scope, selector).find((candidate) =>
        isElementVisibleInDocument(candidate, scopeDoc),
      );
      if (element) {
        try {
          element.click();
          return;
        } catch (error) {
          // ignore
        }
      }
    }

    try {
      const escape = () =>
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        });
      scopeDoc.dispatchEvent(escape());
      scopeDoc.defaultView?.document?.dispatchEvent?.(escape());
    } catch (error) {
      // ignore
    }
  }

  function getFrameDocument(frame) {
    try {
      return frame.contentDocument || frame.contentWindow?.document || null;
    } catch (error) {
      return null;
    }
  }

  function getFrameUrl(frame) {
    try {
      return frame.contentWindow?.location?.href || "";
    } catch (error) {
      return "";
    }
  }

  function isElementVisibleInDocument(element, doc) {
    if (!element || !doc || typeof element.getClientRects !== "function") {
      return false;
    }
    const win = doc.defaultView;
    if (!win) return false;
    try {
      if (!element.getClientRects().length) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 2 && rect.height < 2) return false;
      if (typeof element.checkVisibility === "function") {
        try {
          if (
            !element.checkVisibility({
              checkOpacity: true,
              checkVisibilityCSS: true,
            })
          ) {
            return false;
          }
        } catch (error) {
          // ignore
        }
      }
      const style = win.getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0
      );
    } catch (error) {
      return false;
    }
  }

  function findLiepinDetailChatButton(doc) {
    if (!doc) return null;
    const selectors = [
      'a[data-selector="chat-chat"]',
      'button[data-selector="chat-chat"]',
      '[data-selector*="chat"]',
      "div.chat-btn-box button",
      ".chat-btn-box button",
      "a.btn-main",
      ".btn-main",
      ".btn-chat",
      '[class*="chat-btn"]',
      '[class*="btn-chat"]',
    ];

    const isChatLabel = (text) => /聊一聊|继续聊|继续沟通|立即沟通/.test(text);
    const candidates = [];
    const push = (element, text) => {
      if (candidates.some((item) => item.element === element)) return;
      candidates.push({ element, text });
    };
    for (const selector of selectors) {
      for (const element of doc.querySelectorAll(selector)) {
        const text = normalizeText(
          element.innerText || element.textContent || "",
        );
        if (!text || !isChatLabel(text)) continue;
        if (!isElementVisibleInDocument(element, doc)) continue;
        push(element, text);
      }
    }
    for (const element of doc.querySelectorAll("button, a, [role='button']")) {
      const text = normalizeText(
        element.innerText || element.textContent || "",
      );
      if (!isChatLabel(text)) continue;
      if (!isElementVisibleInDocument(element, doc)) continue;
      push(element, text);
    }
    if (!candidates.length) return null;

    return (
      candidates.find((item) => /聊一聊/.test(item.text))?.element ||
      candidates.find((item) => /立即沟通/.test(item.text))?.element ||
      candidates.find((item) => /继续聊|继续沟通/.test(item.text))?.element ||
      null
    );
  }

  function readLiepinFeedbackFromDocument(doc) {
    if (!doc) return [];
    const roots = [];
    const seen = new Set();
    for (const selector of LIEPIN_FEEDBACK_SELECTORS) {
      for (const element of doc.querySelectorAll(selector)) {
        if (!isElementVisibleInDocument(element, doc)) continue;
        // 聊天窗口本身（含输入框）不是平台提示；否则聊天内容里的
        // “验证码/登录”等业务词会被误判成风控并中断整个投递。
        if (
          element.querySelector(
            'textarea, [contenteditable], [role="textbox"]',
          )
        ) {
          continue;
        }
        const text = normalizeText(
          element.innerText || element.textContent || "",
        );
        if (!text || text.length > 2000) continue;
        if (!/沟通|投递|登录|验证|上限|会员|频繁|异常|成功|失败/.test(text)) {
          continue;
        }
        if (seen.has(text)) continue;
        seen.add(text);
        roots.push({ element, text });
      }
    }
    return roots;
  }

  // 不限关键词地收集平台提示（toast/弹窗）。点击“聊一聊”后如果平台拒绝开聊，
  // 常见表现是没有任何聊天窗口、只弹一条几秒后消失的提示；旧逻辑会等到超时并
  // 误报“未检测到聊天输入框”，这里把真实原因保留下来。
  function readLiepinNoticeFromDocument(doc) {
    if (!doc) return [];
    const selectors = [
      ".ant-message-notice-content",
      ".ant-message",
      ".ant-notification-notice",
      ".ant-notification",
      ".ant-modal-confirm",
      ".ant-modal-content",
      ".ant-im-message-notice-content",
      ".ant-im-message",
      ".ant-im-notification-notice",
      ".ant-im-notification",
      ".ant-im-modal-confirm",
      ".ant-im-modal-content",
      "[role='dialog']",
      "[role='alert']",
      "[role='status']",
      ".im-ui-toast",
      "[class*='toast']",
    ];
    const notices = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const element of doc.querySelectorAll(selector)) {
        if (!isElementVisibleInDocument(element, doc)) continue;
        // 聊天窗口本身（含输入框）不是提示。
        if (
          element.querySelector(
            'textarea, [contenteditable], [role="textbox"]',
          )
        ) {
          continue;
        }
        const text = normalizeText(
          element.innerText || element.textContent || "",
        );
        if (!text || text.length > 500 || seen.has(text)) continue;
        seen.add(text);
        notices.push(text);
      }
    }
    return notices;
  }

  function hasVisibleLoginSurfaceInDocument(doc) {
    if (!doc) return false;
    const selectors = [
      "iframe[src*='passport']",
      ".passport-login",
      ".login-dialog",
      ".login-modal",
      "#loginname",
      ".login-submit-btn",
    ];
    return selectors.some((selector) =>
      Array.from(doc.querySelectorAll(selector)).some((element) =>
        isElementVisibleInDocument(element, doc),
      ),
    );
  }

  async function applyLiepinViaDetailFrame(job) {
    if (!job.detailUrl) {
      return { ok: false, message: "未找到聊一聊按钮，且缺少职位详情链接" };
    }

    log("debug", "列表卡片未找到聊一聊按钮，尝试通过职位详情页兜底");
    const frame = document.createElement("iframe");
    frame.src = job.detailUrl;
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText =
      "position:fixed;left:0;top:0;width:1280px;height:900px;border:0;opacity:0.01;z-index:-2147483647;pointer-events:none;";
    document.body.appendChild(frame);

    let cleaned = false;
    let restoreFramePopupWatch = null;
    let framePopup = null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (restoreFramePopupWatch) restoreFramePopupWatch();
      try {
        frame.remove();
      } catch (error) {
        // ignore
      }
    };

    try {
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        frame.addEventListener("load", finish, { once: true });
        // 详情页的聊天入口在服务端 HTML 里，DOM 可读后即可判断；
        // 不必为了等广告/统计资源把 load 事件等满 15 秒。
        window.setTimeout(finish, 5000);
      });

      let nullSince = 0;
      // 闲聊入口是服务端渲染的；正常 1~2 秒内就能找到。
      // 网申/投递简历类职位没有聊天按钮，没必要等 15 秒。
      const findDeadline = Date.now() + 8000;
      let applyAreaSince = 0;
      let button = null;

      while (Date.now() < findDeadline) {
        const frameUrl = getFrameUrl(frame);
        if (/safe\.liepin\.com|passport\.liepin\.com/i.test(frameUrl)) {
          cleanup();
          return {
            ok: false,
            limited: true,
            message: "猎聘要求安全验证，请手动完成验证后重试",
          };
        }

        const doc = getFrameDocument(frame);
        if (!doc) {
          if (!nullSince) nullSince = Date.now();
          else if (Date.now() - nullSince > 8000) {
            cleanup();
            return {
              ok: false,
              message:
                "无法在后台读取职位详情页（可能被浏览器或网站阻止），请手动处理该职位",
            };
          }
          await sleep(300);
          continue;
        }
        nullSince = 0;

        button = findLiepinDetailChatButton(doc);
        if (button) break;

        // 外部网申职位只有 apply-ats 入口，没有聊一聊，直接跳过。
        const externalApply = Array.from(
          doc.querySelectorAll('[data-selector="apply-ats"]'),
        ).find((element) => isElementVisibleInDocument(element, doc));
        if (externalApply) {
          cleanup();
          return {
            ok: false,
            skipped: true,
            message: "该职位为外部网申，无聊天入口，跳过",
          };
        }

        // 操作区已经渲染但没有聊一聊：大概率是网申/投简历类职位。
        // 给页面 2 秒渲染宽限后直接结束，不再空等。
        const applyArea =
          doc.querySelector(
            "section.job-apply-container, .job-apply-operate, .apply-box",
          ) || doc.querySelector('[data-selector="apply-job"]');
        if (applyArea) {
          if (!applyAreaSince) applyAreaSince = Date.now();
          else if (Date.now() - applyAreaSince > 2000) break;
        } else {
          applyAreaSince = 0;
        }

        const feedbackText = readLiepinFeedbackFromDocument(doc)
          .map((item) => item.text)
          .join("；");
        if (
          isLoginOrVerifyText(feedbackText) ||
          hasVisibleLoginSurfaceInDocument(doc)
        ) {
          cleanup();
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "详情页需要登录或验证",
          };
        }
        if (isLimitText(feedbackText)) {
          cleanup();
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "平台沟通次数受限",
          };
        }

        await sleep(300);
      }

      if (!button) {
        const finalDoc = getFrameDocument(frame);
        const applied = finalDoc
          ? Array.from(
              finalDoc.querySelectorAll(
                "button, a, [role='button'], span",
              ),
            ).find(
              (element) =>
                isElementVisibleInDocument(element, finalDoc) &&
                /^(已沟通|已投递|聊过了|已招满)$/.test(
                  normalizeText(element.innerText || element.textContent || ""),
                ),
            )
          : null;
        cleanup();
        if (applied) {
          return {
            ok: false,
            skipped: true,
            message: "职位详情页显示已沟通/已投递",
          };
        }
        return {
          ok: false,
          skipped: true,
          message: "职位详情页无聊天入口（网申/投递简历类职位），跳过",
        };
      }

      const buttonText = normalizeText(
        button.innerText || button.textContent || "",
      );
      // 「继续聊」只表示会话已存在，可能是之前点击失败留下的空会话；
      // 仍然点进去，由聊天记录判断是否真的沟通过。
      if (/已沟通|已投递|聊过了/.test(buttonText)) {
        cleanup();
        return { ok: false, skipped: true, message: "职位详情页显示已沟通/已投递" };
      }

      const detailDoc = getFrameDocument(frame);
      if (!detailDoc) {
        cleanup();
        return {
          ok: false,
          message: "无法读取职位详情页聊天窗口，请手动处理",
        };
      }

      // 详情页的 IM 在初始化失败时可能退化为 window.open 打开独立聊天页；
      // 顶部页面的 popupWatch 捕获不到 iframe 窗口的 open，这里单独监听。
      try {
        const frameWindow = frame.contentWindow;
        const originalOpen = frameWindow.open;
        frameWindow.open = function patchedFrameOpen(...args) {
          const popup = originalOpen.apply(this, args);
          if (popup) framePopup = popup;
          return popup;
        };
        restoreFramePopupWatch = () => {
          try {
            frameWindow.open = originalOpen;
          } catch (error) {
            // ignore
          }
        };
      } catch (error) {
        // 跨域或窗口已销毁时忽略
      }

      // 详情页也要先记录当前 IM 状态，点击后只认新出现/变化的会话。
      // 聊天窗口可能渲染在详情 iframe 内，也可能由详情页通知顶层页面渲染，两个文档都监听。
      snapshotLiepinImWidgetsInDocument([detailDoc, document]);

      const waitDocs = [
        // iframe 点击后可能整页跳转，用函数每次重新读取 contentDocument。
        () => getFrameDocument(frame),
        document,
      ];
      // IM 模块懒加载时首次点击会被“聊天功能正在初始化”吞掉；
      // 等模块就绪后重新定位按钮，最多重试 2 次。
      let found = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt === 0) {
          try {
            button.click();
          } catch (error) {
            cleanup();
            throw error;
          }
        } else {
          await sleep(2000);
          const retryDoc = getFrameDocument(frame);
          const retryButton = retryDoc
            ? findLiepinDetailChatButton(retryDoc)
            : null;
          if (!retryButton) break;
          try {
            retryButton.click();
          } catch (error) {
            // ignore
          }
        }
        found = await waitForNewLiepinImWidgetInDocument(waitDocs, {
          job,
          timeoutMs: attempt === 0 ? 6000 : 9000,
        });
        if (
          !found.error ||
          found.error.limited ||
          found.error.retryable === false
        ) {
          break;
        }
        if (framePopup) break;
        // “正在初始化”可以多试两次；普通超时只补点一次，避免无入口岗位拖太久。
        const canRetry = found.error.transient ? attempt < 2 : attempt === 0;
        if (!canRetry) break;
      }
      found = found || {
        error: { ok: false, message: "点击后未打开聊天窗口" },
      };
      if (found.error) {
        if (framePopup) {
          try {
            framePopup.close();
          } catch (error) {
            // ignore
          }
          cleanup();
          return {
            ok: false,
            message: "点击后打开了新页面（聊天窗口在独立标签页），需手动处理",
          };
        }
        cleanup();
        return found.error;
      }

      // 详情页同样必须真实发送招呼语并确认消息，不能仅凭聊天窗口打开判定成功。
      const result = await deliverLiepinGreetingInDocument(
        found.widget.doc,
        found.widget.root,
      );
      cleanup();
      return result;
    } catch (error) {
      cleanup();
      return { ok: false, message: `详情页投递失败：${error.message || error}` };
    }
  }

  async function applyLiepinJob(job) {
    const card = job.card;
    if (!card || !document.contains(card)) {
      return { ok: false, message: "职位卡片已刷新，跳过" };
    }

    // 猎聘前端对 ZQ(3)/ZZ(4)/RPO(5)/ATS(7) 职位不渲染“聊一聊”按钮，
    // 这类职位通常是校招网申/投简历流程。直接跳过，避免 hover 后
    // 再打开隐藏详情页空等十几秒。
    if (
      ["3", "4", "5", "7"].includes(String(job.jobKind || "")) ||
      /校招网申/.test(job.rawText || "")
    ) {
      return {
        ok: false,
        skipped: true,
        message: "该职位为校招/网申职位，无聊天入口，跳过",
      };
    }

    // 记录点击前的 IM 会话状态：点击后只认新出现或标题/消息变化的会话，
    // 避免把常驻侧栏里的旧会话误判成本次操作。
    snapshotLiepinImWidgetsInDocument(document);

    card.scrollIntoView({ block: "center" });
    await sleep(200);

    // 猎聘列表卡片通常要 hover 后才渲染「聊一聊」，先模拟 hover；仍找不到则走详情页兜底。
    const button = await findLiepinActionButtonWithHover(card);
    if (!button) {
      return applyLiepinViaDetailFrame(job);
    }

    const buttonText = normalizeText(
      button.innerText || button.textContent || "",
    );
    // 关键：不把「继续聊」当作此前已沟通。
    // 猎聘在会话建立后（包括上次点击后未成功发送）都会显示「继续聊」，
    // 此时仍应点开会话，由聊天记录判断是否真的沟通过。
    if (/已沟通|已投递|聊过了/.test(buttonText)) {
      return { ok: false, skipped: true, message: "岗位显示已沟通/已投递" };
    }

    const popupWatch = installPopupWatch();
    try {
      // 首次点击可能被“聊天功能正在初始化”吞掉；确认没有打开新页面后，
      // 等 IM 模块就绪再重新定位按钮，最多重试 2 次。
      let found = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const attemptButton =
          attempt === 0 ? button : getLiepinActionButton(card);
        if (
          !attemptButton ||
          !isElementVisible(attemptButton) ||
          isDisabled(attemptButton)
        ) {
          break;
        }
        attemptButton.click();
        if (attempt === 0) {
          await sleep(500);
        }
        if (popupWatch.opened.length) break;

        found = await waitForNewLiepinImWidgetInDocument(document, {
          card,
          job,
          timeoutMs: attempt === 0 ? 6000 : 9000,
        });
        if (
          !found.error ||
          found.error.limited ||
          found.error.retryable === false ||
          popupWatch.opened.length
        ) {
          break;
        }
        // “正在初始化”可以多试两次；普通超时只补点一次，避免无入口岗位拖太久。
        const canRetry = found.error.transient ? attempt < 2 : attempt === 0;
        if (!canRetry) break;
        await sleep(2000);
      }
      found = found || {
        error: { ok: false, message: "聊一聊按钮已失效，跳过" },
      };
      if (found.error) {
        if (popupWatch.opened.length) {
          popupWatch.closeAll();
          return { ok: false, message: "点击后打开了新页面，需手动处理" };
        }
        return found.error;
      }

      // 不再以“聊天窗口打开 / 按钮变继续聊”判定成功：
      // 必须实际发送招呼语，并在聊天记录里确认消息已经出现。
      const result = await deliverLiepinGreetingInDocument(
        found.widget.doc,
        found.widget.root,
      );
      if (result.ok || result.skipped) {
        closeLiepinChat(found.widget.doc, found.widget.root);
      }
      return result;
    } finally {
      popupWatch.restore();
    }
  }

  async function goLiepinNextPage() {
    const pagination = document.querySelector(
      ".list-pagination-box, .ant-pagination",
    );
    const nextItem =
      pagination?.querySelector("li.ant-pagination-next") ||
      document.querySelector("li.ant-pagination-next");

    if (nextItem) {
      const disabled =
        nextItem.classList.contains("ant-pagination-disabled") ||
        nextItem.getAttribute("aria-disabled") === "true";
      if (disabled) return false;

      const nextButton = nextItem.querySelector("button") || nextItem;
      try {
        // 猎聘通常为 SPA 翻页，但少数模板会整页跳转；先留存续跑状态。
        saveResumeState({ phase: "pagination" });
        nextButton.click();
        log("debug", "猎聘已点击下一页");
        return true;
      } catch (error) {
        return false;
      }
    }

    return scrollForMoreJobs("猎聘");
  }

  // =====================================================================
  // 智联招聘
  // =====================================================================

  function isZhaopinListPage() {
    if (!/(^|\.)zhaopin\.com$/i.test(location.hostname)) return false;

    if (
      /^https:\/\/(sou\.zhaopin\.com|www\.zhaopin\.com\/(sou|jobs))/i.test(
        location.href,
      )
    ) {
      return true;
    }

    // 新版/灰度路径兜底：页面已经渲染出职位列表布局时也视为列表页。
    return Boolean(
      document.querySelector(
        ".job-list-panel, .jobs-list-sort-scroll, .joblist-box__item, .joblist-box .joblist-item",
      ),
    );
  }

  function ensureZhaopinLogin() {
    if (/passport\.zhaopin\.com|\/login/i.test(location.href)) {
      return { ok: false, reason: "请先在浏览器里自行登录智联招聘。" };
    }

    const pageState = getPageGlobal("__INITIAL_STATE__");
    if (pageState && pageState.user && Object.keys(pageState.user).length) {
      return { ok: true };
    }
    if (pageState && pageState.isLogged === true) return { ok: true };
    if (pageState && pageState.isLogged === false) {
      return { ok: false, reason: "智联招聘当前未登录，请先登录。" };
    }

    const unloginMarker = document.querySelector(
      ".positionlist__list-unlogin, .joblist-box__item-unlogin",
    );
    if (unloginMarker && isElementVisible(unloginMarker)) {
      return { ok: false, reason: "智联招聘当前未登录，请先登录。" };
    }

    const loginGate = document.querySelector(
      ".header-nav__c-no-login, .job-list-login-gate, .job-list-login-gate__btn",
    );
    if (loginGate && isElementVisible(loginGate)) {
      return { ok: false, reason: "智联招聘当前未登录，请先登录。" };
    }

    return { ok: true };
  }

  function getZhaopinJobCardElements() {
    const cards = collectCardsBySelectors(ZHAOPIN_SELECTORS.jobCards, {
      preferVisible: true,
      firstNonEmpty: true,
    });
    // 新版拆分布局可能先命中职位锚点，需要向上归一到包含投递按钮的卡片。
    return cards.map(normalizeZhaopinCard);
  }

  function normalizeZhaopinCard(card) {
    if (!card) return card;
    const marker =
      ".collect-and-apply__btn, .apply-btn, .jobinfo__name, [class*='collect-and-apply'], .job-card__title-main";
    if (card.querySelector?.(marker)) return card;

    let node = card;
    for (let depth = 0; node && depth < 6; depth += 1) {
      if (node.querySelector?.(marker)) return node;
      node = node.parentElement;
    }
    return card;
  }

  function isNewZhaopinLayout() {
    return Boolean(
      document.querySelector(
        ".job-list-panel, .jobs-list-sort-scroll, .job-split-layout",
      ),
    );
  }

  function isNewZhaopinCard(card) {
    return Boolean(
      card &&
        card.classList.contains("job-card") &&
        !card.classList.contains("joblist-box__item"),
    );
  }

  function extractZhaopinSlug(href) {
    const match = String(href || "").match(
      /\/jobdetail\/([^/?#]+)\.htm/i,
    );
    return match ? match[1] : "";
  }

  function looksLikeZhaopinItem(obj) {
    if (!obj || typeof obj !== "object") return false;
    if (obj.jobDetailData && (obj.name || obj.jobId || obj.number)) return true;
    if (
      obj.applyType !== undefined &&
      (obj.jobId || obj.number) &&
      obj.companyName
    ) {
      return true;
    }
    if (obj.base && obj.desc && (obj.base.positionNumber || obj.base.positionId)) {
      return true;
    }
    return false;
  }

  function pickZhaopinPosition(card) {
    if (zhaopinPositionCache.has(card)) {
      return zhaopinPositionCache.get(card);
    }

    const seeds = [];
    for (const key of ["__vue__", "__vue_app__", "__vueParentComponent", "_vnode"]) {
      if (card[key]) seeds.push(card[key]);
    }
    if (card.__vue__) {
      seeds.push(
        card.__vue__.data,
        card.__vue__._data,
        card.__vue__._props,
        card.__vue__.$props,
      );
    }
    if (card.__vueParentComponent) {
      seeds.push(
        card.__vueParentComponent.props,
        card.__vueParentComponent.ctx,
        card.__vueParentComponent.setupState,
        card.__vueParentComponent.proxy,
      );
    }

    const found = findObjectByPredicate(seeds, looksLikeZhaopinItem, 5);
    zhaopinPositionCache.set(card, found);
    return found;
  }

  function normalizeZhaopinItem(raw) {
    if (!raw || typeof raw !== "object") return null;

    const detail = raw.jobDetailData || raw;
    const position =
      (detail && detail.position) || (raw && raw.position) || null;
    const base = (position && position.base) || raw.base || null;
    const desc = (position && position.desc) || raw.desc || null;
    const staff = (detail && detail.staff) || raw.staff || null;
    const staffCard = raw.staffCard || null;
    const companyProxy = detail && detail.companyProxy;

    return {
      jobId: raw.jobId ?? base?.positionId ?? null,
      positionNumber:
        raw.number ||
        base?.positionNumber ||
        raw.positionNumber ||
        "",
      positionName:
        raw.name || base?.positionName || raw.positionName || "",
      companyName:
        raw.companyName ||
        (companyProxy && companyProxy.companyName) ||
        "",
      salary: raw.salary60 || base?.salary || raw.salary || "",
      description:
        (desc && desc.description) || raw.jobSummary || raw.description || "",
      workCity: raw.workCity || "",
      cityDistrict: raw.cityDistrict || "",
      education: raw.education || base?.education || "",
      workingExp: raw.workingExp || base?.positionWorkingExp || "",
      skillTags: (raw.jobSkillTags || (desc && desc.labels) || [])
        .map((item) => (typeof item === "string" ? item : item?.name))
        .filter(Boolean),
      commercialLabels: (raw.commercialLabel || [])
        .map((item) =>
          typeof item === "string"
            ? item
            : item?.typeName || item?.labelDescription || "",
        )
        .filter(Boolean),
      companySize: raw.companySize || "",
      industryName: raw.industryName || "",
      hasAppliedPosition: Boolean(raw.hasAppliedPosition),
      applyType: raw.applyType,
      positionUrl: raw.positionUrl || raw.positionURL || base?.positionUrl || "",
      hrStateInfo:
        (staffCard && staffCard.hrStateInfo) ||
        (staff && staff.hrStateInfo) ||
        "",
      hrOnlineState:
        (staffCard && staffCard.hrOnlineState) ||
        (staff && staff.hrOnlineState) ||
        "",
      hrName:
        (staffCard && staffCard.staffName) ||
        (staff && staff.staffName) ||
        "",
      hrOnline:
        (staffCard && staffCard.hrOnlineIocState === 1) ||
        (staff && staff.hrOnlineIocState === 1) ||
        false,
    };
  }

  function findZhaopinStateItem(href) {
    const slug = extractZhaopinSlug(href);
    if (!slug) return null;
    const pageState = getPageGlobal("__INITIAL_STATE__");
    const list = Array.isArray(pageState?.positionList)
      ? pageState.positionList
      : [];
    return (
      list.find((item) => {
        if (!item || typeof item !== "object") return false;
        if (item.number === slug) return true;
        if (String(item.positionUrl || "").includes(slug)) return true;
        const normalized = normalizeZhaopinItem(item);
        return normalized?.positionNumber === slug;
      }) || null
    );
  }

  function getZhaopinStateList() {
    const pageState = getPageGlobal("__INITIAL_STATE__");
    return Array.isArray(pageState?.positionList)
      ? pageState.positionList
      : [];
  }

  function findZhaopinStateItemByCard(card, index) {
    const list = getZhaopinStateList();
    if (!list.length) return null;

    const title = pickDomText(card, [
      ".job-card__title-main",
      ".job-card__title-clamp",
    ]);
    const company = pickDomText(card, [".job-card__company-name"]);

    let item = null;
    if (title) {
      item = list.find(
        (candidate) =>
          normalizeText(candidate?.name) === title &&
          (!company || normalizeText(candidate?.companyName) === company),
      );
      if (!item) {
        item = list.find((candidate) => {
          const name = normalizeText(candidate?.name);
          return name && (title.includes(name) || name.includes(title));
        });
      }
    }
    if (!item && Number.isInteger(index) && index >= 0 && index < list.length) {
      item = list[index];
    }
    return item || null;
  }

  function getZhaopinStateItemForJob(job) {
    return (
      getZhaopinStateList().find((item) => {
        if (!item || typeof item !== "object") return false;
        if (
          job.jobId != null &&
          item.jobId != null &&
          String(item.jobId) === String(job.jobId)
        ) {
          return true;
        }
        return Boolean(
          job.positionNumber && item.number === job.positionNumber,
        );
      }) || null
    );
  }

  function isZhaopinJobAppliedInState(job) {
    const item = getZhaopinStateItemForJob(job);
    return Boolean(item?.hasAppliedPosition);
  }

  function getZhaopinDetailSummaryText() {
    const summary = document.querySelector(
      ".job-detail-panel .job-detail-summary, .job-detail-summary",
    );
    return normalizeText(summary?.innerText || summary?.textContent || "");
  }

  function getZhaopinDetailApplyButton() {
    const panel = document.querySelector(
      ".job-detail-panel, .job-detail-summary",
    );
    if (!panel) return null;
    return (
      findButtonByText(panel, ["立即投递"]) ||
      panel.querySelector("button.job-detail-summary__apply") ||
      null
    );
  }

  // 外部网申类职位没有站内「立即投递」，详情面板/弹窗里只有网申入口。
  const ZHAOPIN_EXTERNAL_APPLY_PATTERN =
    /网申|前往官网|去官网|官网投递|外部投递|外部申请/;

  function isZhaopinExternalApplyText(text) {
    return ZHAOPIN_EXTERNAL_APPLY_PATTERN.test(normalizeText(text));
  }

  function findZhaopinExternalApplyButton(root) {
    if (!root) return null;
    for (const element of root.querySelectorAll(
      "button, a, [role='button']",
    )) {
      if (!isElementVisible(element)) continue;
      const text = normalizeText(
        element.innerText || element.textContent || "",
      );
      if (text && isZhaopinExternalApplyText(text)) return element;
    }
    return null;
  }

  // 列表卡片标题会被 CSS 截断成「...」，详情面板标题是完整文本，
  // 直接 includes 比较会失败，比较前先去掉末尾省略号。
  function isSameZhaopinJobTitle(leftText, rightText) {
    const left = normalizeText(leftText).replace(/[.…]+$/, "");
    const right = normalizeText(rightText).replace(/[.…]+$/, "");
    if (!left || !right) return false;
    return left.includes(right) || right.includes(left);
  }

  function clickZhaopinElement(element) {
    const link = element?.closest?.("a[href]");
    if (!link) return element?.click();

    const preventNavigation = (event) => event.preventDefault();
    link.addEventListener("click", preventNavigation, true);
    try {
      element.click();
    } finally {
      link.removeEventListener("click", preventNavigation, true);
    }
  }

  async function selectZhaopinCard(job) {
    const card = job.card;
    if (!card || !document.contains(card)) return false;
    if (card.classList.contains("job-card--active")) return true;

    card.scrollIntoView({ block: "center" });
    try {
      // 点击卡片容器选中职位，避免标题/外层链接触发站内路由跳转。
      clickZhaopinElement(card);
    } catch (error) {
      // ignore
    }

    const deadline = Date.now() + 6000;
    let retried = false;
    while (Date.now() < deadline) {
      await sleep(300);
      if (card.classList.contains("job-card--active")) return true;

      const state = getPageGlobal("__INITIAL_STATE__");
      if (
        job.positionNumber &&
        state?.selectedJobId === job.positionNumber
      ) {
        return true;
      }

      const detailTitle = normalizeText(
        document.querySelector(".job-detail-summary__title-text")
          ?.textContent || "",
      );
      if (detailTitle && isSameZhaopinJobTitle(detailTitle, job.jobName)) {
        return true;
      }

      if (!retried && Date.now() > deadline - 4500) {
        retried = true;
        try {
          clickZhaopinElement(card);
        } catch (error) {
          // ignore
        }
      }
    }
    return false;
  }

  async function waitForZhaopinDetailAction(job, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let currentSince = 0;
    while (Date.now() < deadline) {
      const panel = document.querySelector(
        ".job-detail-panel, .job-detail-summary",
      );
      const detailTitle = normalizeText(
        panel?.querySelector(".job-detail-summary__title-text")
          ?.textContent || "",
      );
      const state = getPageGlobal("__INITIAL_STATE__");
      const isCurrentJob =
        !job.jobName ||
        isSameZhaopinJobTitle(detailTitle, job.jobName) ||
        (job.positionNumber && state?.selectedJobId === job.positionNumber);

      if (isCurrentJob) {
        if (!currentSince) currentSince = Date.now();

        const applyButton = findButtonByText(panel, ["立即投递"]);
        if (applyButton) return { applyButton, externalButton: null };

        // 网申入口优先于其它按钮，避免把「网申」当成「立即投递」去点击。
        const externalButton = findZhaopinExternalApplyButton(panel);
        if (externalButton) return { applyButton: null, externalButton };

        const actionButton = panel?.querySelector(
          "button.job-detail-summary__apply",
        );
        const actionText = normalizeText(
          actionButton?.innerText || actionButton?.textContent || "",
        );
        if (/继续沟通|已投递|已申请/.test(actionText)) {
          return { applyButton: actionButton, externalButton: null };
        }

        // 详情面板已确认是当前职位，但 2 秒内没有任何投递入口：
        // 多为下线职位或纯展示职位，直接放弃，不再空等。
        if (Date.now() - currentSince >= 2000) break;
      } else {
        currentSince = 0;
      }
      await sleep(300);
    }
    return { applyButton: null, externalButton: null };
  }

  function getZhaopinApplyButton(card) {
    let fallback = null;
    for (const selector of ZHAOPIN_SELECTORS.applyButton) {
      const element = card.querySelector(selector);
      if (!element) continue;
      if (isElementVisible(element)) return element;
      if (!fallback) fallback = element;
    }

    for (const element of card.querySelectorAll(
      "button, a, [role='button']",
    )) {
      if (
        !/^(立即投递|投个简历|申请职位)$/.test(
          normalizeText(element.innerText || element.textContent || ""),
        )
      ) {
        continue;
      }
      if (isElementVisible(element)) return element;
      if (!fallback) fallback = element;
    }

    return fallback;
  }

  function buildZhaopinJobDetail(card, index) {
    const newLayout = isNewZhaopinCard(card);
    const link = newLayout
      ? null
      : card.querySelector(
          "a.jobinfo__name, a[href*='/jobdetail/'], a[href*='jobdetail']",
        );

    let rawItem = null;
    if (newLayout) {
      // 新版卡片的 DOM 上没有 jobId，优先用列表状态数据（信息也最完整）。
      rawItem =
        findZhaopinStateItemByCard(card, index) || pickZhaopinPosition(card);
    } else {
      rawItem =
        pickZhaopinPosition(card) ||
        (link ? findZhaopinStateItem(link.href) : null);
    }
    const position = normalizeZhaopinItem(rawItem) || {};

    // 新版卡片标题被 CSS 截断（末尾是「…」），优先取 aria-label 里的完整标题，
    // 否则详情面板标题永远匹配不上。
    const cardTitleFull = newLayout
      ? normalizeText(
          card
            .querySelector(
              ".job-card__title-clamp[aria-label], .job-card__title-main[aria-label], .job-card__title-clamp [aria-label], .job-card__title-main [aria-label]",
            )
            ?.getAttribute("aria-label") || "",
        )
      : "";
    const jobName =
      cardTitleFull ||
      (newLayout
        ? pickDomText(card, [
            ".job-card__title-main",
            ".job-card__title-clamp",
            "[class*='job-card__title']",
          ])
        : normalizeText(link?.innerText || link?.textContent || "") ||
          pickDomText(card, [".jobinfo__name", "[class*='jobName']"])) ||
      position.positionName ||
      "";
    const brandName =
      (newLayout
        ? pickDomText(card, [
            ".job-card__company-name",
            "[class*='job-card__company']",
          ])
        : pickDomText(card, [
            ".companyinfo__name",
            ".companyinfo__top a",
            "[class*='companyName']",
            "[class*='company-name']",
          ])) ||
      position.companyName ||
      "";
    const salaryFromDom = newLayout
      ? pickDomText(card, [".job-card__salary", "[class*='salary']"])
      : pickDomText(card, [".jobinfo__salary", "[class*='salary']"]);
    // 未登录时智联会把薪资打码成 **-**元，此时优先使用列表状态里的真实薪资。
    const salaryDesc = /\*\*/.test(salaryFromDom)
      ? position.salary || salaryFromDom
      : salaryFromDom || position.salary || "";
    const cityName =
      (newLayout
        ? pickDomText(card, [
            ".job-card__location span",
            ".job-card__location",
          ])
        : pickDomText(card, [
            ".jobinfo__other-info-item span",
            "[class*='location']",
            "[class*='city']",
          ])) ||
      [position.workCity, position.cityDistrict].filter(Boolean).join("-") ||
      "";

    let labelNodes = newLayout
      ? Array.from(
          card.querySelectorAll(
            ".job-card__skill-tag, [class*='job-card__skill-tag']",
          ),
        )
      : Array.from(
          card.querySelectorAll(".jobinfo__tag .joblist-box__item-tag"),
        );
    if (!labelNodes.length) {
      labelNodes = Array.from(
        card.querySelectorAll(
          ".joblist-box__item-tag, [class*='skill-tag']",
        ),
      );
    }
    const labels = labelNodes
      .map((element) => normalizeText(element.innerText || element.textContent))
      .filter(Boolean)
      .slice(0, 30);

    const companyTags = [
      ...new Set([
        ...Array.from(
          card.querySelectorAll(".companyinfo__tag .joblist-box__item-tag"),
        )
          .map((element) =>
            normalizeText(element.innerText || element.textContent),
          )
          .filter(Boolean),
        ...(position.commercialLabels || []),
      ]),
    ].slice(0, 20);

    const staffState =
      pickDomText(card, [
        ".companyinfo__staff-state",
        "[class*='staff-state']",
        "[class*='staffState']",
      ]) || position.hrStateInfo;

    const applyButton = newLayout ? null : getZhaopinApplyButton(card);
    const applyText = normalizeText(
      applyButton?.innerText || applyButton?.textContent || "",
    );
    const rawText = normalizeText(card.innerText || card.textContent || "");
    const slug =
      position.positionNumber ||
      (link ? extractZhaopinSlug(link.href) : "");
    const jobId = position.jobId || slug;
    const description = position.description || "";
    const contact =
      position.hasAppliedPosition ||
      (!newLayout && /已投递|已申请/.test(applyText));
    const onlineText = `${position.hrOnlineState} ${staffState} ${rawText}`;
    const recruiterOnline =
      position.hrOnline === true ||
      (/在线|刚刚活跃|今日活跃|分钟前活跃/.test(onlineText) &&
        !/(\d+)\s*(天|周|月)前/.test(onlineText));

    if (!jobName && !brandName && !jobId) return null;

    return {
      platform: "zhaopin",
      index,
      card,
      raw: rawItem,
      key: `zhaopin|${jobId || `${jobName}|${brandName}`}`,
      jobId,
      positionNumber: slug,
      jobName,
      brandName,
      salaryDesc,
      cityName,
      jobLabels: [...new Set([...labels, ...position.skillTags])],
      skills: position.skillTags || [],
      filterText: [rawText, description, companyTags.join(" ")]
        .filter(Boolean)
        .join(" "),
      rawText,
      detailUrl: toHttps(link?.href || position.positionUrl),
      description,
      contact,
      isHeadhunter: /猎头/.test(
        `${companyTags.join(" ")} ${brandName}`,
      ),
      recruiterOnline,
      activeTimeDesc: staffState,
      applyType: position.applyType,
      applyAvailable: newLayout
        ? String(position.applyType) === "1" ||
          Boolean(getZhaopinDetailApplyButton())
        : Boolean(applyButton),
    };
  }

  async function fetchZhaopinJobDetail(job) {
    if (job.description) {
      return { postDescription: job.description };
    }
    if (!job.detailUrl) return null;

    // 列表页的 __INITIAL_STATE__ 通常已带完整 JD；这里只做兜底。
    try {
      const response = await fetch(job.detailUrl, {
        credentials: "include",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) return null;
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const postDescription = pickDomText(doc, [
        ".describtion-card__detail-content",
        ".describtion-card__content-wrap",
        "[class*='describtion-card__detail']",
        "[class*='job-description']",
      ]);
      return postDescription ? { postDescription } : null;
    } catch (error) {
      return null;
    }
  }

  function readZhaopinFeedback() {
    return collectVisibleText(ZHAOPIN_SELECTORS.feedback, (text) =>
      /投递|申请|简历|登录|验证|上限|成功|失败|异常|完善|附件|网申|官网/.test(
        text,
      ),
    );
  }

  function findZhaopinConfirmButton(feedbackRoots) {
    const labels = ["确认投递", "确认申请", "继续投递", "确定"];
    for (const root of feedbackRoots) {
      const button = findButtonByText(root, labels);
      if (button) return button;
    }
    return null;
  }

  function closeZhaopinDialogs(allowConfirm = false) {
    const feedback = readZhaopinFeedback();
    for (const item of feedback) {
      const closeSelectors = [
        ".a-dialog__close",
        ".el-dialog__close",
        ".ant-modal-close",
        "[aria-label='Close']",
        "[class*='dialog'] [class*='close']",
        "[class*='modal'] [class*='close']",
        ".deliver-greeting-modal [class*='close']",
        ".deliver-greeting-modal__close",
        "[class*='greeting-modal'] [class*='close']",
      ];
      let closed = false;
      for (const selector of closeSelectors) {
        const element = item.element.querySelector(selector);
        if (element && isElementVisible(element)) {
          try {
            element.click();
            closed = true;
            break;
          } catch (error) {
            // ignore
          }
        }
      }
      if (closed) continue;

      if (allowConfirm) {
        const confirm = findButtonByText(item.element, [
          "知道了",
          "确定",
          "关闭",
        ]);
        if (confirm) {
          try {
            confirm.click();
          } catch (error) {
            // ignore
          }
        }
      }
    }

    try {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
    } catch (error) {
      // ignore
    }
  }

  async function applyZhaopinNewLayoutJob(job) {
    const card = job.card;
    if (!card || !document.contains(card)) {
      return { ok: false, message: "职位卡片已刷新，跳过" };
    }

    if (readZhaopinFeedback().length) {
      closeZhaopinDialogs(false);
      await sleep(250);
    }
    const preClickFeedback = readZhaopinFeedback()
      .map((item) => item.text)
      .join("；");

    const selected = await selectZhaopinCard(job);
    if (!selected) {
      return { ok: false, message: "无法在右侧详情面板中选中该职位" };
    }

    const { applyButton, externalButton } = await waitForZhaopinDetailAction(
      job,
      4000,
    );
    if (externalButton) {
      return {
        ok: false,
        skipped: true,
        message: "该职位为外部网申，无法站内投递，跳过",
      };
    }
    if (!applyButton) {
      const summaryText = getZhaopinDetailSummaryText();
      if (
        isZhaopinJobAppliedInState(job) ||
        /继续沟通|已投递|已申请/.test(summaryText)
      ) {
        return { ok: true, softSuccess: true, message: "此前已投递" };
      }
      return { ok: false, message: "详情面板未找到立即投递按钮" };
    }

    const applyText = normalizeText(
      applyButton.innerText || applyButton.textContent || "",
    );
    if (/已投递|已申请|继续沟通/.test(applyText) || isDisabled(applyButton)) {
      return { ok: true, softSuccess: true, message: "此前已投递" };
    }

    const popupWatch = installPopupWatch();
    try {
      clickZhaopinElement(applyButton);
    } catch (error) {
      popupWatch.restore();
      throw error;
    }

    const deadline = Date.now() + 15000;
    let lastFeedback = "";
    let confirmAttempts = 0;

    try {
      while (Date.now() < deadline) {
        await sleep(300);

        if (popupWatch.opened.length) {
          popupWatch.closeAll();
          return {
            ok: false,
            skipped: true,
            message: "该职位需跳转外部页面投递，跳过",
          };
        }

        const feedback = readZhaopinFeedback();
        const feedbackText = feedback.map((item) => item.text).join("；");
        lastFeedback = feedbackText;
        const summaryText = getZhaopinDetailSummaryText();

        if (
          isZhaopinJobAppliedInState(job) ||
          /继续沟通|已投递|已申请/.test(summaryText) ||
          (feedbackText !== preClickFeedback &&
            /已向对方发送简历|简历投递成功|投递成功|申请成功/.test(
              feedbackText,
            ))
        ) {
          closeZhaopinDialogs(true);
          return { ok: true, message: "投递成功" };
        }

        if (
          feedbackText !== preClickFeedback &&
          isZhaopinExternalApplyText(feedbackText)
        ) {
          closeZhaopinDialogs(true);
          return {
            ok: false,
            skipped: true,
            message: "该职位为外部网申，需手动投递，跳过",
          };
        }

        if (hasVisibleLoginSurface() || isLoginOrVerifyText(feedbackText)) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "需要登录或人工验证",
          };
        }

        if (isLimitText(feedbackText)) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "今日投递次数受限",
          };
        }

        if (isResumeIssueText(feedbackText)) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "简历需人工完善",
          };
        }

        if (confirmAttempts < 2 && /投递|申请|简历/.test(feedbackText)) {
          const confirm = findZhaopinConfirmButton(
            feedback.map((item) => item.element),
          );
          if (confirm) {
            confirmAttempts += 1;
            try {
              confirm.click();
              await sleep(500);
            } catch (error) {
              // ignore
            }
          }
        }
      }
    } finally {
      popupWatch.restore();
    }

    return {
      ok: false,
      message: lastFeedback
        ? `点击后未确认结果：${lastFeedback.slice(0, 120)}`
        : "点击后未检测到投递结果",
    };
  }

  async function applyZhaopinJob(job) {
    // 2026 新版左右分栏：先选中卡片，再点右侧详情面板的「立即投递」。
    if (isNewZhaopinCard(job.card)) {
      return applyZhaopinNewLayoutJob(job);
    }

    const card = job.card;
    if (!card || !document.contains(card)) {
      return { ok: false, message: "职位卡片已刷新，跳过" };
    }

    if (readZhaopinFeedback().length) {
      closeZhaopinDialogs(false);
      await sleep(250);
    }
    // 记录点击前的提示文本，避免把上一次遗留的成功/限额弹窗算到本次投递。
    const preClickFeedback = readZhaopinFeedback()
      .map((item) => item.text)
      .join("；");

    const button = getZhaopinApplyButton(card);
    if (!button) {
      if (findZhaopinExternalApplyButton(card)) {
        return {
          ok: false,
          skipped: true,
          message: "该职位为外部网申，无法站内投递，跳过",
        };
      }
      return { ok: false, message: "未找到立即投递按钮" };
    }

    const buttonText = normalizeText(
      button.innerText || button.textContent || "",
    );
    if (/已投递|已申请/.test(buttonText) || isDisabled(button)) {
      return { ok: true, softSuccess: true, message: "此前已投递" };
    }

    card.scrollIntoView({ block: "center" });
    const popupWatch = installPopupWatch();
    try {
      clickZhaopinElement(button);
    } catch (error) {
      popupWatch.restore();
      throw error;
    }

    const deadline = Date.now() + 15000;
    let lastFeedback = "";
    let confirmAttempts = 0;

    try {
      while (Date.now() < deadline) {
        await sleep(300);

        if (popupWatch.opened.length) {
          popupWatch.closeAll();
          return {
            ok: false,
            skipped: true,
            message: "该职位需跳转外部页面投递，跳过",
          };
        }

        const feedback = readZhaopinFeedback();
        const feedbackText = feedback.map((item) => item.text).join("；");
        lastFeedback = feedbackText;

        if (hasVisibleLoginSurface() || isLoginOrVerifyText(feedbackText)) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "需要登录或人工验证",
          };
        }

        const currentButton = getZhaopinApplyButton(card);
        const currentText = normalizeText(
          currentButton?.innerText || currentButton?.textContent || "",
        );

        if (
          /已投递|已申请/.test(currentText) ||
          (/简历投递成功|投递成功|申请成功|已向对方发送简历/.test(
            feedbackText,
          ) &&
            feedbackText !== preClickFeedback)
        ) {
          closeZhaopinDialogs(true);
          return { ok: true, message: "投递成功" };
        }

        if (
          feedbackText !== preClickFeedback &&
          isZhaopinExternalApplyText(feedbackText)
        ) {
          closeZhaopinDialogs(true);
          return {
            ok: false,
            skipped: true,
            message: "该职位为外部网申，需手动投递，跳过",
          };
        }

        if (isLimitText(feedbackText)) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "今日投递次数受限",
          };
        }

        if (isResumeIssueText(feedbackText)) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "简历需人工完善",
          };
        }

        // 只在投递/申请类弹窗里点确认，避免误点页面上的其它“确定”按钮。
        if (
          confirmAttempts < 2 &&
          /投递|申请|简历/.test(feedbackText)
        ) {
          const confirm = findZhaopinConfirmButton(
            feedback.map((item) => item.element),
          );
          if (confirm) {
            confirmAttempts += 1;
            try {
              confirm.click();
              await sleep(500);
            } catch (error) {
              // ignore
            }
          }
        }
      }
    } finally {
      popupWatch.restore();
    }

    return {
      ok: false,
      message: lastFeedback
        ? `点击后未确认结果：${lastFeedback.slice(0, 120)}`
        : "点击后未检测到投递结果",
    };
  }

  async function goZhaopinNextPage() {
    if (isNewZhaopinLayout()) {
      const listPanel = document.querySelector(
        ".job-list-panel, .jobs-list-sort-scroll",
      );
      const loadMore = Array.from(
        listPanel?.querySelectorAll("button, a") || [],
      ).find(
        (element) =>
          isElementVisible(element) &&
          !isDisabled(element) &&
          /加载更多|查看更多/.test(
            normalizeText(element.innerText || element.textContent || ""),
          ),
      );
      if (loadMore) {
        try {
          loadMore.click();
          log("debug", "智联已点击加载更多");
          return true;
        } catch (error) {
          // fall through to scroll
        }
      }

      const state = getPageGlobal("__INITIAL_STATE__");
      if (state && state.hasMore === false) return false;
    }

    const nextLink = Array.from(
      document.querySelectorAll(
        "a.soupager__btn, .soupager__btn, [class*='pagination'] a, [class*='pagination'] button, a, button",
      ),
    ).find(
      (element) =>
        isElementVisible(element) &&
        !isDisabled(element) &&
        normalizeText(element.innerText || element.textContent || "").includes(
          "下一页",
        ),
    );

    if (nextLink) {
      const href = toHttps(
        nextLink.getAttribute("href") || nextLink.href || "",
      );
      // 智联翻页可能是整页跳转，先保存运行状态，下一页加载后自动续跑。
      saveResumeState({ phase: "pagination" });
      await sleep(200);

      if (href && !/^javascript:/i.test(href)) {
        log("debug", "智联已跳转下一页");
        location.href = href;
        return true;
      }

      try {
        nextLink.click();
        log("debug", "智联已点击下一页");
        return true;
      } catch (error) {
        return false;
      }
    }

    // 新版拆分布局可能改为内部滚动加载。
    return scrollForMoreJobs("智联");
  }

  // =====================================================================
  // 前程无忧（51job）
  // =====================================================================

  function isQianchengListPage() {
    return (
      location.hostname === "we.51job.com" &&
      /^\/pc\/search(?:\/|$)/i.test(location.pathname)
    );
  }

  function ensureQianchengLogin() {
    if (/passport\.51job\.com|\/login/i.test(location.href)) {
      return { ok: false, reason: "请先在浏览器里自行登录前程无忧。" };
    }

    const app = getPageWindow().document?.querySelector("#app")?.__vue__;
    if (typeof app?.islogin === "boolean") {
      return app.islogin
        ? { ok: true }
        : { ok: false, reason: "前程无忧当前未登录，请先登录。" };
    }

    const loginEntry = Array.from(
      document.querySelectorAll("a, button"),
    ).find(
      (element) =>
        isElementVisible(element) &&
        /^(登录|登录\/注册|立即登录)$/.test(
          normalizeText(element.innerText || element.textContent || ""),
        ),
    );
    return loginEntry
      ? { ok: false, reason: "未检测到前程无忧登录状态，请先登录。" }
      : { ok: true };
  }

  function getQianchengJobCardElements() {
    return collectCardsBySelectors(QIANCHENG_SELECTORS.jobCards, {
      preferVisible: true,
      firstNonEmpty: true,
    });
  }

  function findQianchengSearchComponent() {
    const root = getPageWindow().document?.querySelector("#app")?.__vue__;
    if (!root) return null;

    const queue = [root];
    const seen = new Set();
    while (queue.length && seen.size < 40) {
      const component = queue.shift();
      if (!component || seen.has(component)) continue;
      seen.add(component);
      if (
        component.$options?.name === "PCSearch" &&
        Array.isArray(component.joblist)
      ) {
        return component;
      }
      queue.push(...(component.$children || []));
    }
    return null;
  }

  function getQianchengJobState(jobId) {
    return (
      findQianchengSearchComponent()?.joblist?.find(
        (item) => String(item?.jobId) === String(jobId),
      ) || null
    );
  }

  function buildJobDataFromQianchengCard(card) {
    const dataElement = card.querySelector("[sensorsdata]");
    if (!dataElement) return null;
    try {
      return JSON.parse(dataElement.getAttribute("sensorsdata"));
    } catch (error) {
      return null;
    }
  }

  function buildQianchengJobDetail(card, index) {
    const cardData = buildJobDataFromQianchengCard(card) || {};
    const raw = getQianchengJobState(cardData.jobId) || cardData;
    const rawText = normalizeText(card.innerText || card.textContent || "");
    const applyButton = card.querySelector(QIANCHENG_SELECTORS.applyButton);
    const buttonText = normalizeText(
      applyButton?.innerText || applyButton?.textContent || "",
    );
    const jobId = String(raw.jobId || cardData.jobId || "");
    const jobName = normalizeText(
      raw.jobName || cardData.jobTitle || pickDomText(card, [".jname"]),
    );
    const brandName = normalizeText(
      raw.fullCompanyName ||
        raw.companyName ||
        pickDomText(card, [".cname"]),
    );
    const labels = Array.isArray(raw.jobTags)
      ? raw.jobTags.filter(Boolean)
      : [];
    const description = normalizeText(raw.jobDescribe || "");

    if (!jobId || (!jobName && !brandName)) return null;

    return {
      platform: "qiancheng",
      index,
      key: `qiancheng|${jobId}`,
      card,
      raw,
      jobId,
      jobName,
      brandName,
      salaryDesc: normalizeText(
        raw.provideSalaryString ||
          cardData.jobSalary ||
          pickDomText(card, [".sal"]),
      ),
      cityName: normalizeText(
        raw.jobAreaString || cardData.jobArea || "",
      ),
      jobLabels: labels,
      skills: labels,
      filterText: [rawText, description].filter(Boolean).join(" "),
      rawText,
      detailUrl: toHttps(raw.jobHref || ""),
      description,
      contact: Boolean(raw.isApply) || /^(已申请|已投递)$/.test(buttonText),
      isHeadhunter: /猎头/.test(`${brandName} ${rawText}`),
      recruiterOnline:
        raw.hrIsOnline === true || raw.isOnline === true || /在线/.test(rawText),
      externalApply: String(raw.isJump) === "1",
      graduateApply:
        raw.isFromXyx === true ||
        raw.isFromXyx === 1 ||
        raw.isFromXyx === "1" ||
        raw.isFromXyx === "true",
      expired: Boolean(raw.isExpire),
      applyButton,
    };
  }

  async function fetchQianchengJobDetail(job) {
    return job.description ? { postDescription: job.description } : null;
  }

  function qianchengFeedback() {
    return collectVisibleText(QIANCHENG_SELECTORS.feedback, (text) =>
      /投递|申请|简历|登录|验证|上限|成功|失败|异常|完善|网申|官网/.test(text),
    );
  }

  async function applyQianchengJob(job) {
    if (job.graduateApply) {
      return {
        ok: false,
        skipped: true,
        message: "校招网申职位需前往应届生求职平台申请，跳过",
      };
    }

    const card = job.card;
    if (!card || !document.contains(card)) {
      return { ok: false, message: "职位卡片已刷新，跳过" };
    }
    if (job.expired || job.externalApply) {
      return {
        ok: false,
        skipped: true,
        message: job.expired ? "职位已下线，跳过" : "该职位需前往外部网站投递，跳过",
      };
    }
    if (job.contact) {
      return { ok: false, skipped: true, message: "职位已申请，跳过重复投递" };
    }

    const button = card.querySelector(QIANCHENG_SELECTORS.applyButton);
    if (!button || isDisabled(button)) {
      return { ok: false, skipped: true, message: "未找到可用的投递按钮" };
    }

    const beforeFeedback = qianchengFeedback().map((item) => item.text).join("；");
    const popupWatch = installPopupWatch();
    try {
      button.click();
      const deadline = Date.now() + 30000;
      let lastFeedback = "";
      let resumeSubmitClicked = false;
      while (Date.now() < deadline) {
        await sleep(300);
        if (popupWatch.opened.length) {
          popupWatch.closeAll();
          return {
            ok: false,
            skipped: true,
            message: "该职位需跳转外部页面投递，跳过",
          };
        }

        const feedback = qianchengFeedback();
        const feedbackText = feedback.map((item) => item.text).join("；");
        lastFeedback = feedbackText;
        if (
          hasVisibleLoginSurface() ||
          isLoginOrVerifyText(feedbackText)
        ) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "需要登录或人工验证",
          };
        }
        if (isLimitText(feedbackText)) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "前程无忧投递次数受限",
          };
        }

        if (isResumeIssueText(feedbackText)) {
          return {
            ok: false,
            limited: true,
            message: feedbackText.slice(0, 160) || "简历需人工完善",
          };
        }

        const resumePicker = document.querySelector(
          ".apply-component-resume-dialog",
        );
        if (resumePicker && getComputedStyle(resumePicker).display !== "none") {
          if (resumeSubmitClicked) {
            await sleep(300);
            continue;
          }

          const submitButton = resumePicker.querySelector(
            '.apply-component-resume-dialog-footer a[sensor_elementid="sensor_my_applyButton"]',
          );
          if (submitButton && !isDisabled(submitButton)) {
            resumeSubmitClicked = true;
            submitButton.click();
            await sleep(1000);
            continue;
          }
          return {
            ok: false,
            limited: true,
            message: "前程无忧要求先完善简历，已暂停；请手动完善后重新启动。",
          };
        }

        const currentButton = card.querySelector(QIANCHENG_SELECTORS.applyButton);
        const currentText = normalizeText(
          currentButton?.innerText || currentButton?.textContent || "",
        );
        if (
          /^(已申请|已投递|继续沟通)$/.test(currentText) ||
          (feedbackText !== beforeFeedback &&
            /投递成功|申请成功|简历投递成功/.test(feedbackText))
        ) {
          return { ok: true, message: "前程无忧已确认投递" };
        }
        if (
          feedbackText !== beforeFeedback &&
          /网申|前往官网|去官网|官网投递|外部投递|外部申请/.test(feedbackText)
        ) {
          return {
            ok: false,
            skipped: true,
            message: "该职位需前往外部网站投递，跳过",
          };
        }
      }

      return {
        ok: false,
        message: lastFeedback
          ? `点击后未确认结果：${lastFeedback.slice(0, 120)}`
          : "点击后未检测到投递结果",
      };
    } finally {
      popupWatch.restore();
    }
  }

  async function goQianchengNextPage() {
    const pagination = document.querySelector(
      QIANCHENG_SELECTORS.searchPagination,
    );
    const nextButton = pagination?.querySelector(".btn-next");
    if (!nextButton || isDisabled(nextButton)) return false;

    try {
      nextButton.click();
      log("debug", "前程无忧已切换下一页");
      return true;
    } catch (error) {
      return false;
    }
  }

  // =====================================================================
  // 实习僧
  // =====================================================================

  function isShixisengListPage() {
    return (
      /^(www|resume)\.shixiseng\.com$/i.test(location.hostname) &&
      /^\/interns(?:\/|$)/i.test(location.pathname)
    );
  }

  function ensureShixisengLogin() {
    if (/login/i.test(location.href)) {
      return { ok: false, reason: "请先在浏览器里自行登录实习僧。" };
    }

    const pageWindow = getPageWindow();
    const root =
      pageWindow.$nuxt?.$store ||
      document.querySelector(".intern-item")?.__vue__?.$store;
    if (typeof root?.state?.isLogin === "boolean") {
      return root.state.isLogin
        ? { ok: true }
        : { ok: false, reason: "实习僧当前未登录，请先登录。" };
    }

    const loginEntry = Array.from(document.querySelectorAll("a, button")).find(
      (element) =>
        isElementVisible(element) &&
        /^(登录|登录\/注册|立即登录)$/.test(
          normalizeText(element.innerText || element.textContent || ""),
        ),
    );
    return loginEntry
      ? { ok: false, reason: "未检测到实习僧登录状态，请先登录。" }
      : { ok: true };
  }

  function getShixisengJobCardElements() {
    return collectCardsBySelectors(SHIXISENG_SELECTORS.jobCards, {
      preferVisible: true,
      firstNonEmpty: true,
    });
  }

  function getShixisengDetailUrl(url) {
    if (!url) return "";
    try {
      const detailUrl = new URL(toHttps(url), location.origin);
      detailUrl.hostname = location.hostname;
      return detailUrl.href;
    } catch (error) {
      return "";
    }
  }

  function buildShixisengJobDetail(card, index) {
    const link = card.querySelector('a[href*="/intern/"]');
    const itemData = card.__vue__?.$options?.propsData?.itemData || {};
    const jobId =
      link?.href.match(/\/intern\/(inn_[\w-]+)/i)?.[1] ||
      card.getAttribute("data-intern-id") ||
      itemData.uuid ||
      "";
    const detailUrl = getShixisengDetailUrl(
      link?.href || (jobId ? `/intern/${jobId}` : ""),
    );
    const readableText = (value) => {
      const textarea = document.createElement("textarea");
      textarea.innerHTML = String(value || "");
      return normalizeText(
        textarea.value.replace(
          /[-\u{F0000}-\u{10FFFD}]/gu,
          "",
        ),
      );
    };
    const rawText = readableText(card.innerText || card.textContent || "");
    const jobName = readableText(link?.innerText || link?.textContent || itemData.name || "");
    const salaryText = normalizeText(
      card.querySelector('[class*="day"], [class*="salary"]')?.innerText || "",
    );
    const minSalary = Number(itemData.minsalary);
    const maxSalary = Number(itemData.maxsalary);
    const salaryRange =
      minSalary || maxSalary
        ? `${minSalary}-${maxSalary}`
        : [itemData.minsal, itemData.maxsal]
            .map((value) => readableText(value))
            .join("-");
    if (!jobId || !jobName) return null;

    return {
      platform: "shixiseng",
      index,
      key: `shixiseng|${jobId}`,
      card,
      jobId,
      jobName,
      brandName: normalizeText(
        card.querySelector(".intern-detail__company .title")?.innerText ||
          itemData.cname ||
          "",
      ),
      salaryDesc: salaryRange !== "-"
        ? `${salaryRange}/天`
        : /面议/.test(salaryText)
          ? "薪资面议"
          : "",
      cityName: readableText(
        card.querySelector(".city")?.innerText || itemData.city || "",
      ),
      filterText: [
        rawText,
        ...(itemData.c_tags || []),
        ...(itemData.i_tags || []),
      ].join(" "),
      jobLabels: [...(itemData.c_tags || []), ...(itemData.i_tags || [])],
      rawText,
      detailUrl,
      raw: itemData,
      contact:
        itemData.deliver === true ||
        /已投递|已申请/.test(
          normalizeText(card.querySelector(".resume_apply")?.innerText || rawText),
        ),
      isHeadhunter: Boolean(itemData.job_label?.is_hirer),
      recruiterOnline: true,
      externalApply: Boolean(itemData.apply_link),
      applyButton: link,
    };
  }

  async function fetchShixisengJobDetail(job) {
    if (!job.detailUrl) return { postDescription: job.raw?.info || "" };
    try {
      const response = await fetch(job.detailUrl, { credentials: "include" });
      if (!response.ok) return { postDescription: job.raw?.info || "" };
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      return {
        postDescription:
          normalizeText(doc.querySelector(".intern-detail-page")?.innerText || "") ||
          job.raw?.info ||
          "",
      };
    } catch (error) {
      return { postDescription: job.raw?.info || "" };
    }
  }

  function createShixisengApplySession() {
    const tab = getPageWindow().open("about:blank", "_blank");
    if (!tab) return null;
    try {
      tab.document.open();
      tab.document.write("<!doctype html><title>实习僧自动投递</title><p>正在准备投递…</p>");
      tab.document.close();
    } catch (error) {
      return null;
    }
    return tab;
  }

  function closeShixisengApplySession(session) {
    try {
      session?.close();
    } catch (error) {
      // ignore
    }
  }

  async function applyShixisengJob(job, session) {
    if (!job.detailUrl) {
      return { ok: false, skipped: true, message: "未找到职位详情链接" };
    }

    if (!session) {
      return { ok: false, limited: true, message: "无法打开投递页面" };
    }

    const targetUrl = getShixisengDetailUrl(job.detailUrl);
    if (!targetUrl) {
      return { ok: false, limited: true, message: "无效职位链接，已停止投递" };
    }

    try {
      session.location.href = targetUrl;
    } catch (error) {
      return { ok: false, limited: true, message: "无法打开实习僧职位详情页，已停止投递" };
    }

    const deadline = Date.now() + 30000;
    let applyClicked = false;
    let submitClicked = false;
    while (Date.now() < deadline) {
      await sleep(500);
      if (session.closed) {
        return { ok: false, limited: true, message: "职位详情页已关闭，已停止投递" };
      }
      let detailDoc;
      try {
        detailDoc = session.document;
        if (detailDoc.location.hostname !== new URL(targetUrl).hostname) {
          return {
            ok: false,
            limited: true,
            message: "投递页面意外跳转，已停止后续投递",
          };
        }
      } catch (error) {
        continue;
      }
      if (!detailDoc?.querySelector(".intern-detail-page")) continue;

      const pageVm = detailDoc.querySelector(".intern-detail-page")?.__vue__;
      const detail = pageVm?.msg;
      if (!pageVm || !detail) continue;
      if (String(detail.delivered) === "1") {
        return submitClicked
          ? { ok: true, message: "页面已确认该职位投递成功" }
          : { ok: false, skipped: true, message: "职位此前已投递，跳过重复投递" };
      }
      if (applyClicked && /已投递|已申请/.test(detailDoc.querySelector(".resume_apply")?.innerText || "")) {
        return { ok: true, message: "页面已确认该职位投递成功" };
      }
      if (String(detail.overdue) === "1" || detail.intern_status === 1) {
        return { ok: false, skipped: true, message: "职位已下线或过期，跳过" };
      }

      const feedback = Array.from(
        detailDoc.querySelectorAll(SHIXISENG_SELECTORS.feedback.join(",")),
      )
        .filter(
          (element) =>
            isElementVisible(element) &&
            (element.matches(".el-message, [role='alert'], [role='status']") ||
              !element.querySelector(".common-deliver")),
        )
        .map((element) => normalizeText(element.innerText || element.textContent || ""))
        .filter(Boolean)
        .join("；");
      if (
        isLoginOrVerifyText(feedback) ||
        pageVm.$store?.state?.isLogin !== true
      ) {
        return {
          ok: false,
          limited: true,
          message: feedback || "实习僧需要登录或安全验证，请手动处理后重试",
        };
      }
      if (isLimitText(feedback)) {
        return { ok: false, limited: true, message: feedback.slice(0, 160) };
      }

      const deliveryDialog = pageVm.$refs.deliverintern;
      if (!deliveryDialog?.show) {
        if (!applyClicked) {
          const applyButton = detailDoc.querySelector(".resume_apply");
          if (!applyButton || /已投递|已预约/.test(applyButton.innerText || "")) {
            return { ok: false, skipped: true, message: "职位当前不可投递" };
          }
          applyButton.click();
          applyClicked = true;
        }
        continue;
      }

      const deliverOptions = deliveryDialog.deliverOptions;
      if (!deliverOptions?.can_deliver || !deliverOptions.resume?.length) {
        return {
          ok: false,
          limited: true,
          message: "实习僧简历不满足该职位投递要求，请完善简历后重试",
        };
      }

      const resume = deliverOptions.resume.find(
        (item) => item.stype === config.shixisengResume,
      );
      if (!resume) {
        return {
          ok: false,
          limited: true,
          message: `该职位没有${config.shixisengResume === "attach" ? "附件简历" : "在线简历"}选项，请检查实习僧简历设置`,
        };
      }
      if (!resume.deliver_able) {
        return {
          ok: false,
          limited: true,
          message: "预设简历不符合该职位要求，请修改简历设置或完善简历",
        };
      }

      const commonDeliver = detailDoc.querySelector(".common-deliver")?.__vue__;
      if (!commonDeliver) continue;
      const selectedIndex = deliverOptions.resume.indexOf(resume);
      commonDeliver.chooseResume(resume, selectedIndex);
      if (config.shixisengReportTime) {
        if (!commonDeliver.inOptions.some((item) => item.label === config.shixisengReportTime)) {
          return { ok: false, limited: true, message: "该职位不支持设置的到岗时间，已暂停" };
        }
        commonDeliver.report_time = config.shixisengReportTime;
      }
      if (config.shixisengInternshipTime) {
        if (!commonDeliver.timeOptions.some((item) => item.label === config.shixisengInternshipTime)) {
          return { ok: false, limited: true, message: "该职位不支持设置的实习时长，已暂停" };
        }
        commonDeliver.internship_time = config.shixisengInternshipTime;
      }
      if (config.shixisengDays) {
        if (!commonDeliver.olOptions.some((item) => item.label === config.shixisengDays)) {
          return { ok: false, limited: true, message: "该职位不支持设置的每周出勤，已暂停" };
        }
        commonDeliver.days = config.shixisengDays;
      }

      if (submitClicked) {
        if (deliveryDialog.deliverErrorMsg) {
          const message = normalizeText(deliveryDialog.deliverErrorMsg).slice(0, 160);
          return {
            ok: false,
            limited: isLimitText(message) || isLoginOrVerifyText(message),
            message,
          };
        }
        if (
          String(detail.delivered) === "1" ||
          deliveryDialog.deliverResult === "success"
        ) {
          return { ok: true, message: "实习僧已确认投递" };
        }
        continue;
      }

      if (!submitClicked) {
        const submitButton = Array.from(
          detailDoc.querySelectorAll(".deliver-dialog-box .common-deliver__footer .btn"),
        ).find(
          (button) =>
            isElementVisible(button) &&
            !isDisabled(button) &&
            normalizeText(button.innerText || button.textContent || "") === "确认投递",
        );
        if (!submitButton) continue;
        submitButton.click();
        submitClicked = true;
      }
      if (deliveryDialog.deliverErrorMsg) {
        const message = normalizeText(deliveryDialog.deliverErrorMsg).slice(0, 160);
        return {
          ok: false,
          limited: isLimitText(message) || isLoginOrVerifyText(message),
          message,
        };
      }
      if (
        String(detail.delivered) === "1" ||
        deliveryDialog.deliverResult === "success"
      ) {
        return { ok: true, message: "实习僧已确认投递" };
      }
    }

    return { ok: false, message: "等待实习僧投递窗口超时" };
  }

  async function goShixisengNextPage() {
    const pagination = document.querySelector(".el-pagination")?.__vue__;
    if (!pagination || isDisabled(document.querySelector(".el-pagination .btn-next"))) {
      return false;
    }
    const currentPage = pagination.internalCurrentPage;
    pagination.next();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(250);
      if (pagination.internalCurrentPage !== currentPage) {
        log("debug", `实习僧已切换到第 ${pagination.internalCurrentPage} 页`);
        return true;
      }
    }
    return false;
  }

  // =====================================================================
  // 断点续跑
  // =====================================================================

  function resumePendingRun() {
    const saved = takeResumeState();
    if (!saved) return false;
    const adapter = getAdapter();
    if (!adapter || !adapter.isListPage()) return false;

    log("warn", "检测到上次任务在翻页时中断，正在自动继续…");
    window.setTimeout(() => {
      startApply({ resume: saved }).catch((error) => {
        state.running = false;
        state.stopping = false;
        state.current = "续跑异常";
        log("error", `续跑异常：${error.message || error}`, error);
      });
    }, 1200);
    return true;
  }

  // =====================================================================
  // 菜单与路由
  // =====================================================================

  function registerMenuCommands() {
    try {
      if (typeof GM_registerMenuCommand !== "function") return;
      const adapter = getAdapter();
      const label = adapter?.label || "招聘网站";
      GM_registerMenuCommand(`显示/隐藏 ${label} 自动投递面板`, () => {
        if (!cachedPanel) mountPanel();
        state.collapsed = !state.collapsed;
        renderPanel();
      });
      GM_registerMenuCommand(`停止 ${label} 自动投递`, stopApply);
    } catch (error) {
      console.warn(`[${APP_ID}] register menu failed`, error);
    }
  }

  function installRouteWatcher() {
    const rerender = () => {
      window.setTimeout(() => {
        if (isSupportedListPage()) {
          mountPanel();
          return;
        }
        // 新版页面路由切换后列表可能异步渲染，再补一次检测。
        window.setTimeout(() => {
          if (isSupportedListPage()) mountPanel();
        }, 1200);
      }, 500);
    };

    const rawPushState = history.pushState;
    history.pushState = function patchedPushState(...args) {
      const result = rawPushState.apply(this, args);
      rerender();
      return result;
    };

    const rawReplaceState = history.replaceState;
    history.replaceState = function patchedReplaceState(...args) {
      const result = rawReplaceState.apply(this, args);
      rerender();
      return result;
    };

    window.addEventListener("popstate", rerender);
  }

  function bootstrap(attempt = 0) {
    const adapter = getAdapter();
    if (!adapter) return;

    if (attempt === 0) {
      // 先安装菜单和路由监听：即使当前路径不认识，SPA 跳转到列表页后也能挂载面板。
      registerMenuCommands();
      installRouteWatcher();
    }

    if (!adapter.isListPage()) {
      // 新版页面可能异步渲染列表，稍后重试几次。
      if (attempt < 6) {
        window.setTimeout(() => bootstrap(attempt + 1), 800);
      }
      return;
    }

    mountPanel();
    log("success", `${adapter.label} 脚本已加载（v${VERSION}）。`);
    window.setTimeout(() => resumePendingRun(), 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
