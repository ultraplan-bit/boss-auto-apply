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
