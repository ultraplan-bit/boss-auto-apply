import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const sourceDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
// 与 build.mjs 相同的拼接顺序，但不加载 99-bootstrap.js，避免挂载面板。
const source = readdirSync(sourceDir)
  .filter((file) => /^\d+-.+\.js$/.test(file) && file !== "99-bootstrap.js")
  .sort()
  .map((file) => readFileSync(resolve(sourceDir, file), "utf8"))
  .join("\n");

function loadScript({ hostname = "www.zhipin.com", storage = {} } = {}) {
  const store = new Map(Object.entries(storage));
  const context = vm.createContext({
    console: {
      log() {}, warn() {}, error() {}, debug() {}, groupCollapsed() {}, groupEnd() {},
    },
    setTimeout,
    URL,
    URLSearchParams,
    location: { hostname, href: `https://${hostname}/`, pathname: "/" },
    GM_getValue: (key, fallback) =>
      store.has(key) ? structuredClone(store.get(key)) : fallback,
    GM_setValue: (key, value) => store.set(key, structuredClone(value)),
  });
  vm.runInContext("globalThis.window = globalThis;", context);
  vm.runInContext(source, context);
  // 测试里不需要真实等待。
  vm.runInContext("sleep = async () => {};", context);
  return { context, store, run: (code) => vm.runInContext(code, context) };
}

function formatDate(date) {
  const pad = (value) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

test("Boss 活跃时间解析", () => {
  const { context } = loadScript();
  assert.equal(context.parseActiveDays("刚刚活跃"), 0);
  assert.equal(context.parseActiveDays("3日内活跃"), 3);
  assert.equal(context.parseActiveDays("本周活跃"), 7);
  assert.equal(context.parseActiveDays("2周内活跃"), 14);
  assert.equal(context.parseActiveDays("半年前活跃"), 365);
  assert.equal(context.parseActiveDays("未知"), Number.POSITIVE_INFINITY);
});

test("Boss 剩余次数与硬性限制识别", () => {
  const { context } = loadScript();
  assert.equal(context.parseRemainingQuota("开聊提醒；还剩 30 次沟通机会"), 30);
  assert.equal(context.parseRemainingQuota("Success"), null);
  assert.equal(context.isHardLimitMessage("今日沟通人数已达上限"), true);
  assert.equal(context.isHardLimitMessage("还剩 0 次沟通机会"), true);
  assert.equal(context.isHardLimitMessage("开聊提醒；还剩 30 次"), false);
});

test("平台限额与登录提示识别", () => {
  const { context } = loadScript();
  assert.equal(context.isLimitText("今日投递次数已达上限"), true);
  assert.equal(context.isLimitText("投递成功"), false);
  assert.equal(context.isLoginOrVerifyText("请完成安全验证"), true);
  assert.equal(context.isResumeIssueText("请先完善简历后再投递"), true);
});

test("关键词拆分支持中英文逗号、分号和换行", () => {
  const { context } = loadScript();
  assert.deepEqual(
    [...context.splitKeywords(" Java，Go,  Python;\nRust \n")],
    ["java", "go", "python", "rust"],
  );
});

test("对象搜索只读取限定范围内的属性，不触发范围外 getter", () => {
  const { context } = loadScript();
  let reads = 0;
  const wide = {};
  for (let i = 0; i < 10000; i += 1) {
    Object.defineProperty(wide, `key${i}`, {
      enumerable: true,
      get() { reads += 1; return 0; },
    });
  }

  assert.equal(context.getDeepValue(wide, "missing"), undefined);
  assert.equal(reads, 40);
  reads = 0;
  assert.equal(context.findObjectByPredicate([wide], () => false), null);
  assert.equal(reads, 60);
});

test("对象搜索限制整棵组件图大小，循环引用和普通职位仍可读取", () => {
  const { context } = loadScript();
  let reads = 0, visited = 0;
  const branch = (depth) => {
    const node = {};
    if (!depth) return node;
    for (let i = 0; i < 12; i += 1) {
      Object.defineProperty(node, `child${i}`, {
        enumerable: true,
        get() { reads += 1; return branch(depth - 1); },
      });
    }
    return node;
  };
  assert.equal(context.findObjectByPredicate([branch(4)], () => {
    visited += 1;
    return false;
  }, 4), null);
  assert.equal(visited, 500);
  assert.equal(reads, 499);
  reads = 0;
  assert.equal(context.getDeepValue(branch(4), "missing"), undefined);
  assert.equal(reads, 119);

  const job = { securityId: "s", encryptJobId: "job", lid: "list" };
  const component = { props: { job } };
  component.self = component;
  component.duplicate = component.props;
  assert.equal(context.findJobLikeObject([component, component]), job);
  assert.equal(context.getDeepValue(component, "encryptJobId"), "job");
  assert.equal(context.findObjectByPredicate([component], value => value === job, 1), null);

  const position = { applyType: 1, jobId: "position", companyName: "测试公司" };
  const vue3 = { props: { item: position } };
  vue3.parent = vue3;
  assert.equal(context.pickZhaopinPosition({ __vueParentComponent: vue3 }), position);
});

test("配置只保留当前字段并校验类型", () => {
  const { run } = loadScript({
    storage: {
      "boss-auto-apply-lite:config": {
        debug: true,
        includeDescriptionKeywords: "Java",
        dailyLimit: 999,
        onlyOnlineBoss: "yes",
      },
    },
  });
  const config = run("config");
  assert.equal(config.debug, true);
  assert.equal(config.includeDescriptionKeywords, "Java");
  assert.equal(config.onlyOnlineBoss, false);
  assert.equal("dailyLimit" in config, false);
});

test("投递记录迁移旧格式并跨天去重", () => {
  const today = formatDate(new Date());
  const { run, store } = loadScript({
    storage: {
      "boss-auto-apply-lite:history": {
        date: today,
        dailyCount: 2,
        appliedKeys: ["boss|a", "boss|b"],
        applied: { "boss|old": "2000-01-01", "boss|recent": daysAgo(3) },
      },
    },
  });

  const history = run("loadHistory()");
  assert.equal(history.dailyCount, 2);
  assert.deepEqual(Object.keys(history.applied).sort(), [
    "boss|a",
    "boss|b",
    "boss|recent",
  ]);
  assert.equal(run('hasAppliedBefore({ key: "boss|recent" })'), true);
  assert.equal(run('hasAppliedBefore({ key: "boss|old" })'), false);

  run('recordApplied({ key: "boss|c" })');
  run('recordApplied({ key: "boss|c" })');
  const saved = store.get("boss-auto-apply-lite:history");
  assert.equal(saved.dailyCount, 3);
  assert.equal(saved.applied["boss|c"], today);
  assert.equal("appliedKeys" in saved, false);
});

test("投递记录在新的一天重置每日计数但保留去重", () => {
  const { run } = loadScript({
    storage: {
      "boss-auto-apply-lite:history": {
        date: daysAgo(1),
        dailyCount: 150,
        applied: { "boss|a": daysAgo(1) },
      },
    },
  });
  assert.equal(run("loadHistory().dailyCount"), 0);
  assert.equal(run('hasAppliedBefore({ key: "boss|a" })'), true);
});

function makeBossAdapter(run, detail) {
  const calls = { fetchDetail: 0, apply: 0 };
  const adapter = {
    ...run("ADAPTERS.boss"),
    fetchDetail: async () => {
      calls.fetchDetail += 1;
      return detail;
    },
    apply: async () => {
      calls.apply += 1;
      return { ok: false, skipped: true, message: "测试" };
    },
  };
  return { adapter, calls };
}

const bossJob = {
  key: "boss|job-1",
  securityId: "s",
  encryptJobId: "job-1",
  lid: "l",
  jobName: "前端工程师",
  brandName: "测试公司",
};

test("日志增量更新并有数量上限，不向控制台保留原始对象", () => {
  const { context, run } = loadScript();
  const consoleCalls = [];
  context.console = Object.fromEntries(
    ["log", "warn", "error", "debug"].map((method) => [
      method,
      (...args) => consoleCalls.push(args),
    ]),
  );
  const rows = [{ remove() { rows.pop(); } }];
  let created = 0;
  const logs = {
    prepend(row) { rows.unshift(row); },
    get childElementCount() { return rows.length; },
    get lastElementChild() { return rows.at(-1); },
    set innerHTML(_value) { assert.fail("状态更新不应重建日志节点"); },
  };
  context.document = {
    createElement() {
      created += 1;
      return { remove() { rows.splice(rows.indexOf(this), 1); } };
    },
  };
  context.panel = {
    firstElementChild: {},
    classList: { toggle() {} },
    querySelector: (selector) => selector === '[data-role="logs"]' ? logs : {},
  };
  run("cachedPanel = panel; config.debug = true;");
  run('for (let i = 0; i < 500; i++) log("debug", `日志 ${i}`, { payload: new Array(1000).fill(i) });');
  const latest = rows[0];
  run("renderPanel(); renderPanel();");

  assert.equal(run("state.logs.length"), 120);
  assert.equal(run('"data" in state.logs[0]'), false);
  assert.equal(consoleCalls.length, 0);
  assert.equal(created, 500);
  assert.equal(rows.length, 120);
  assert.equal(rows[0], latest);
  assert.match(rows[0].textContent, /日志 499$/);
  assert.match(rows.at(-1).textContent, /日志 380$/);
});

test("Boss 滚动后按稳定 ID 跳过旧卡片，复用节点仍能读取新职位", async () => {
  const { context, run } = loadScript();
  const adapter = run("ADAPTERS.boss");
  let textReads = 0;
  const card = {
    __vue__: { ...bossJob },
    get innerText() { textReads += 1; return "测试卡片"; },
    querySelector() { return null; },
  };
  adapter.getCards = () => [card];
  run('state.processedKeys.add("boss|job-1");');

  assert.equal((await context.collectJobsWithWait(adapter)).length, 0);
  assert.equal(textReads, 0);

  card.__vue__.encryptJobId = "job-2";
  const [job] = await context.collectJobsWithWait(adapter);
  assert.equal(job.key, "boss|job-2");
  assert.equal(textReads, 1);
});

test("运行中面板复用历史摘要，配额和去重仍读取跨标签页的最新记录", () => {
  const key = "boss-auto-apply-lite:history";
  const today = formatDate(new Date());
  const { context, run, store } = loadScript({
    storage: { [key]: { date: today, dailyCount: 3, applied: {} } },
  });
  const getValue = context.GM_getValue;
  let reads = 0;
  context.GM_getValue = (key, fallback) => {
    if (key.endsWith(":history")) reads += 1;
    return getValue(key, fallback);
  };
  const subtitle = {};
  context.panel = {
    firstElementChild: {},
    classList: { toggle() {} },
    querySelector: selector => selector === '[data-role="subtitle"]' ? subtitle : {},
  };
  run("cachedPanel = panel; loadHistory(); state.running = true;");
  for (let i = 0; i < 100; i += 1) context.renderPanel();
  assert.equal(reads, 1);
  assert.match(subtitle.textContent, /今日已投 3\//);

  store.set(key, { date: today, dailyCount: 4, applied: { "boss|other-tab": today } });
  assert.equal(context.hasAppliedBefore({ key: "boss|other-tab" }), true);
  context.renderPanel();
  assert.equal(reads, 2);
  assert.match(subtitle.textContent, /今日已投 4\//);
  context.recordApplied({ key: "boss|new" });
  context.renderPanel();
  assert.equal(reads, 3);
  assert.match(subtitle.textContent, /今日已投 5\//);

  store.get(key).dailyCount = 6;
  run("state.running = false;");
  context.renderPanel();
  assert.equal(reads, 4);
  assert.match(subtitle.textContent, /今日已投 6\//);

  run("state.running = true;");
  const tomorrow = daysAgo(-1);
  context.getToday = () => tomorrow;
  context.renderPanel();
  assert.equal(reads, 5);
  assert.match(subtitle.textContent, /今日已投 0\//);
  context.location.hostname = "www.liepin.com";
  store.set("boss-auto-apply-lite:liepin:history", { date: tomorrow, dailyCount: 8, applied: {} });
  context.renderPanel();
  assert.equal(reads, 6);
  assert.match(subtitle.textContent, /今日已投 8\//);
});

test("任务结束后释放已处理职位集合", async () => {
  const { context, run } = loadScript();
  const adapter = run("ADAPTERS.boss");
  let processedDuringNextPage = 0;
  Object.assign(adapter, {
    isListPage: () => true,
    ensureLogin: () => ({ ok: true }),
    getCards: () => [{}],
    buildJob: () => ({ ...bossJob, contact: true }),
    createApplySession: undefined,
    closeApplySession: undefined,
    nextPage: async () => {
      processedDuringNextPage = run("state.processedKeys.size");
      return false;
    },
  });

  await context.startApply();

  assert.equal(processedDuringNextPage, 1);
  assert.equal(run("state.processedKeys.size"), 0);
});

test("Boss 优先读取 Vue 数据入口，重复扫描旧卡片不展开组件 getter", () => {
  const { context } = loadScript();
  for (const [componentKey, dataKey] of [
    ["__vue__", "_props"], ["__vue__", "_data"],
    ["__vueParentComponent", "props"], ["__vueParentComponent", "setupState"],
  ]) {
    let reads = 0;
    const raw = { ...bossJob };
    const component = {
      [dataKey]: { job: raw },
      get unrelated() { reads += 1; return { child: {} }; },
    };
    const card = { [componentKey]: component };
    assert.equal(context.pickJobData(card), raw);
    const processed = new Set([bossJob.key]);
    for (let i = 0; i < 1000; i += 1) {
      assert.equal(context.buildBossJobDetail(card, i, processed), null);
    }
    assert.equal(reads, 0);
    // Vue 2 会把 data 中的字段代理到组件本身，仍应选中独立职位数据。
    Object.assign(component, bossJob);
    assert.equal(context.pickJobData(card), raw);
  }
  const fallback = { ...bossJob };
  assert.equal(context.pickJobData({ _vnode: { job: fallback } }), fallback);
});

test("Boss 待处理职位仅保留数据快照，不持有 DOM 或响应式标签数组", () => {
  const { context } = loadScript();
  const raw = { ...bossJob, jobLabels: ["双休"], skills: ["JavaScript"] };
  const card = {
    __vue__: { _props: { job: raw } },
    innerText: "前端工程师 测试公司",
    querySelector() { return null; },
  };
  raw.jobLabels.owner = card.__vue__;
  raw.skills.owner = card.__vue__;
  const job = context.buildBossJobDetail(card, 0);
  assert.equal("card" in job, false);
  assert.equal("raw" in job, false);
  assert.notEqual(job.jobLabels, raw.jobLabels);
  assert.notEqual(job.skills, raw.skills);
  raw.jobLabels[0] = "已变化";
  raw.skills[0] = "已变化";
  const text = context.fuzzyText(job, null);
  assert.match(text, /双休/);
  assert.match(text, /JavaScript/);
  assert.doesNotMatch(text, /已变化/);
  assert.equal(context.getJobUniqueKey(job), bossJob.key);
});

test("Boss 未配置关键词时仍按详情过滤不活跃招聘者", async () => {
  const { context, run } = loadScript();
  const { adapter, calls } = makeBossAdapter(run, {
    activeTimeDesc: "半年前活跃",
  });
  await context.handleOneJob({ ...bossJob }, adapter);
  assert.equal(calls.fetchDetail, 1);
  assert.equal(calls.apply, 0);
  assert.equal(run("state.skipped"), 1);
  assert.match(run("state.logs[0].message"), /活跃度未达标/);
});

test("基础过滤未通过时不请求详情", async () => {
  const { context, run } = loadScript();
  const { adapter, calls } = makeBossAdapter(run, null);
  await context.handleOneJob({ ...bossJob, contact: true }, adapter);
  assert.equal(calls.fetchDetail, 0);
  assert.equal(calls.apply, 0);
  assert.match(run("state.logs[0].message"), /已经沟通过/);
});

test("活跃招聘者通过过滤后进入投递", async () => {
  const { context, run } = loadScript();
  const { adapter, calls } = makeBossAdapter(run, {
    activeTimeDesc: "刚刚活跃",
  });
  await context.handleOneJob({ ...bossJob }, adapter);
  assert.equal(calls.fetchDetail, 1);
  assert.equal(calls.apply, 1);
});

test("非 Boss 平台未配置关键词时不请求详情", async () => {
  const { context, run } = loadScript({ hostname: "we.51job.com" });
  let fetched = 0;
  const adapter = {
    ...run("ADAPTERS.qiancheng"),
    fetchDetail: async () => {
      fetched += 1;
      return null;
    },
    apply: async () => ({ ok: false, skipped: true, message: "测试" }),
  };
  await context.handleOneJob(
    { key: "qiancheng|1", jobId: "1", jobName: "测试" },
    adapter,
  );
  assert.equal(fetched, 0);
});

test("前程无忧投递异常时关闭已捕获的弹窗", async () => {
  const { context } = loadScript({ hostname: "we.51job.com" });
  const popup = { closed: false, close() { this.closed = true; } };
  const originalOpen = () => popup;
  context.open = originalOpen;
  context.document = {
    contains: () => true,
    querySelectorAll: () => [],
  };
  const button = {
    disabled: false,
    className: "",
    hasAttribute: () => false,
    getAttribute: () => null,
    click() {
      context.open();
      throw new Error("模拟点击异常");
    },
  };
  const card = { querySelector: () => button };

  await assert.rejects(
    context.applyQianchengJob({ card }),
    /模拟点击异常/,
  );
  assert.equal(popup.closed, true);
  assert.equal(context.open, originalOpen);
});

test("实习僧初始化失败时关闭已打开的投递窗口", () => {
  const { context } = loadScript({ hostname: "www.shixiseng.com" });
  let closed = 0;
  context.open = () => ({
    document: { open() { throw new Error("模拟初始化异常"); } },
    close() { closed += 1; },
  });

  assert.equal(context.createShixisengApplySession(), null);
  assert.equal(closed, 1);
});

test("Boss 真实旧 key 迁移后仍去重，并保留最新日期和每日计数", () => {
  const today = formatDate(new Date());
  const legacyKey = "s|job-1|l|前端工程师|测试公司";
  const { context, run, store } = loadScript({
    storage: {
      "boss-auto-apply-lite:history": {
        date: today,
        dailyCount: 1,
        appliedKeys: [legacyKey],
        applied: {
          "boss|job-1": today,
          "s|job-1|older-lid|前端工程师|测试公司": daysAgo(1),
        },
      },
    },
  });
  const job = context.buildBossJobDetail({
    __vue__: { ...bossJob, lid: "new-search-lid" },
    innerText: "前端工程师 测试公司",
    querySelector() { return null; },
  }, 0);
  assert.equal(context.hasAppliedBefore(job), true);
  assert.equal(context.applyBasicFilters(job, run("ADAPTERS.boss")).ok, false);
  assert.deepEqual(Object.keys(run("loadHistory().applied")), ["boss|job-1"]);
  context.recordApplied(job);
  const saved = store.get("boss-auto-apply-lite:history");
  assert.equal(saved.dailyCount, 1);
  assert.equal(saved.applied["boss|job-1"], today);

  const other = loadScript({
    hostname: "www.liepin.com",
    storage: {
      "boss-auto-apply-lite:liepin:history": {
        date: today, dailyCount: 1, appliedKeys: [legacyKey],
      },
    },
  });
  assert.equal(other.run("loadHistory()").applied[legacyKey], today);
});

test("Boss 详情失败、缺失或活跃度未知时不投递", async () => {
  for (const detail of [
    new Error("网络错误"), null, {},
    { activeTimeDesc: "未知" }, { activeTimeDesc: "长期未活跃" },
  ]) {
    const { context, run } = loadScript();
    const { adapter, calls } = makeBossAdapter(run, detail);
    if (detail instanceof Error) {
      adapter.fetchDetail = async () => { throw detail; };
    }
    await context.handleOneJob({ ...bossJob }, adapter);
    assert.equal(calls.apply, 0);
    assert.equal(run("state.matched"), 0);
    assert.equal(run("state.applied"), 0);
    assert.equal(context.hasAppliedBefore(bossJob), false);
    assert.equal(run("state.failed"), detail instanceof Error ? 1 : 0);
  }
});

test("Boss 详情接口的登录、风控和限额错误会停止任务", async () => {
  for (const [status, data] of [
    [401, { code: 401 }], [403, { code: 403 }], [429, { code: 429 }],
    [200, { code: 37, message: "今日沟通次数已达上限" }],
  ]) {
    const { context, run } = loadScript();
    context.document = { cookie: "bst=mock" };
    context.fetch = async () => ({
      ok: status === 200, status, text: async () => JSON.stringify(data),
    });
    let applied = 0;
    const adapter = {
      ...run("ADAPTERS.boss"),
      apply: async () => { applied += 1; return { ok: true }; },
    };
    await context.handleOneJob({ ...bossJob }, adapter);
    assert.equal(applied, 0);
    assert.equal(run("state.failed"), 1);
    assert.equal(run("state.stopping"), true);
  }
});

test("Boss 非 JSON 响应不记成功、不发送图片，合法成功仍正常处理", async () => {
  const { context, run } = loadScript();
  context.document = { cookie: "bst=mock" };
  let text = "", status = 200, images = 0;
  context.fetch = async () => ({
    ok: status === 200, status, text: async () => text,
  });
  context.sendBossImageResume = async () => {
    images += 1;
    return { ok: true, message: "模拟图片发送" };
  };
  run("config.bossImageResumeEnabled = true;");
  const adapter = {
    ...run("ADAPTERS.boss"),
    fetchDetail: async () => ({ activeTimeDesc: "刚刚活跃" }),
  };
  for (const body of ["<html>请先登录</html>", "Success"]) {
    text = body;
    assert.equal((await context.applyBossJob(bossJob)).ok, false);
    await context.handleOneJob({ ...bossJob }, adapter);
    assert.equal(run("state.applied"), 0);
    assert.equal(context.hasAppliedBefore(bossJob), false);
    assert.equal(images, 0);
  }
  status = 403;
  assert.equal((await context.applyBossJob(bossJob)).limited, true);
  status = 200;
  text = JSON.stringify({ code: 0, message: "Success" });
  await context.handleOneJob({ ...bossJob }, adapter);
  assert.equal(run("state.applied"), 1);
  assert.equal(run("loadHistory().dailyCount"), 1);
  assert.equal(images, 1);
});

test("详情请求期间停止后，不再发起投递或增加匹配数", async () => {
  const { context, run } = loadScript();
  let resolveDetail;
  const detail = new Promise((resolve) => { resolveDetail = resolve; });
  const { adapter, calls } = makeBossAdapter(run, detail);
  run("state.running = true;");
  const pending = context.handleOneJob({ ...bossJob }, adapter);
  context.stopApply();
  resolveDetail({ activeTimeDesc: "刚刚活跃" });
  await pending;
  assert.equal(calls.fetchDetail, 1);
  assert.equal(calls.apply, 0);
  assert.equal(run("state.matched"), 0);
  assert.equal(run("state.stopping"), true);
});

test("猎聘详情页清理所有弹窗和 iframe", async () => {
  for (const outcome of ["error", "success"]) {
    const { context } = loadScript({ hostname: "www.liepin.com" });
    const opened = [];
    const originalOpen = () => {
      const popup = { closed: false, close() { this.closed = true; } };
      opened.push(popup);
      return popup;
    };
    const frameWindow = { open: originalOpen };
    const detailDoc = {};
    let removed = false;
    const frame = {
      contentWindow: frameWindow,
      style: {},
      setAttribute() {},
      addEventListener(type, listener) {
        if (type === "load") listener();
      },
      remove() { removed = true; },
    };
    context.setTimeout = (callback) => { callback(); return 0; };
    context.document = { body: { appendChild() {} }, createElement: () => frame };
    context.getFrameUrl = () => "https://www.liepin.com/job/mock";
    context.getFrameDocument = () => detailDoc;
    context.findLiepinDetailChatButton = () => ({
      innerText: "聊一聊",
      click() {},
    });
    context.snapshotLiepinImWidgetsInDocument = () => [];
    context.waitForNewLiepinImWidgetInDocument = async () => {
      frameWindow.open();
      frameWindow.open();
      return outcome === "error"
        ? { error: { ok: false, message: "模拟超时" } }
        : { widget: { doc: detailDoc, root: {} } };
    };
    context.deliverLiepinGreetingInDocument = async () => ({ ok: true });

    const result = await context.applyLiepinViaDetailFrame({
      detailUrl: "https://www.liepin.com/job/mock",
    });

    assert.equal(result.ok, outcome === "success");
    assert.equal(removed, true);
    assert.ok(opened.every((popup) => popup.closed));
    assert.equal(frameWindow.open, originalOpen);
  }
});

test("猎聘新会话必须唯一匹配岗位，不按窗口数量猜测", () => {
  const { context, run } = loadScript({ hostname: "www.liepin.com" });
  assert.equal(run("liepinImSnapshot instanceof WeakMap"), true);
  const job = { recruiterName: "目标招聘者", brandName: "目标公司", jobName: "工程师" };
  let widgets = [];
  context.readLiepinImState = () => ({ widgets });
  context.snapshotLiepinImWidgetsInDocument({});
  const right = { editor: {}, root: {}, heading: "目标公司 目标招聘者", signature: "right" };
  const wrong = { editor: {}, root: {}, heading: "无关公司 其他招聘者", signature: "wrong" };
  const ambiguous = { editor: {}, root: {}, heading: "目标公司 另一招聘者", signature: "other" };
  widgets = [wrong];
  assert.equal(context.findNewLiepinImWidgetInDocument({}, job), null);
  widgets = [wrong, right];
  assert.equal(context.findNewLiepinImWidgetInDocument({}, job), right);
  widgets = [right, ambiguous];
  assert.equal(context.findNewLiepinImWidgetInDocument({}, job), null);
  widgets = [right];
  assert.equal(context.findNewLiepinImWidgetInDocument({}, job), right);
  context.snapshotLiepinImWidgetsInDocument({});
  right.signature += "|新消息";
  assert.equal(context.findNewLiepinImWidgetInDocument({}, job), null);
  right.heading = "无关公司 其他招聘者";
  assert.equal(context.findNewLiepinImWidgetInDocument({}, job), null);
  right.heading = "目标公司 工程师";
  assert.equal(context.findNewLiepinImWidgetInDocument({}, job), right);
  right.heading = "";
  assert.equal(context.findNewLiepinImWidgetInDocument({}, job), null);
});

test("猎聘已有回复优先跳过，新平台招呼仍可确认", async () => {
  for (const kind of ["matching", "defaultOutgoing", "nonDefaultOutgoing"]) {
    for (const hasReply of [true, false]) {
      const { context } = loadScript({ hostname: "www.liepin.com" });
      let fills = 0, clicks = 0;
      context.setLiepinEditorText = () => { fills += 1; return true; };
      context.readLiepinChatState = () => ({
        editor: {}, sendButton: { click() { clicks += 1; } }, editorText: "",
        outgoing: ["招呼"], incoming: hasReply ? ["历史回复"] : [],
        matching: [], defaultOutgoing: [], nonDefaultOutgoing: [], [kind]: ["招呼"],
      });
      const result = await context.deliverLiepinGreetingInDocument({}, {});
      assert.equal(result.ok, !hasReply);
      if (hasReply) assert.equal(result.skipped, true);
      assert.equal(fills, 0);
      assert.equal(clicks, 0);
    }
  }
});

test("猎聘发送前迟到的回复不算成功、不补发，纯自动招呼仍算成功", async () => {
  for (const hasReply of [true, false]) {
    for (const kind of ["matching", "defaultOutgoing", "nonDefaultOutgoing", "none"]) {
      if (!hasReply && kind === "none") continue;
      const { context, run } = loadScript({ hostname: "www.liepin.com" });
      const greeting = run("normalizeText(config.liepinGreeting) || DEFAULT_CONFIG.liepinGreeting");
      let reads = 0, fills = 0, clicks = 0;
      context.setLiepinEditorText = () => { fills += 1; return true; };
      context.readLiepinChatState = () => {
        const late = ++reads > 2;
        return {
          editor: {}, sendButton: { click() { clicks += 1; } },
          editorText: reads > 1 ? greeting : "",
          outgoing: late && kind !== "none" ? ["招呼"] : [],
          incoming: late && hasReply ? ["迟到的历史回复"] : [],
          matching: [], defaultOutgoing: [], nonDefaultOutgoing: [],
          ...(late && kind !== "none" ? { [kind]: ["招呼"] } : {}),
        };
      };
      const result = await context.deliverLiepinGreetingInDocument({}, {});
      assert.equal(result.ok, !hasReply);
      if (hasReply) assert.equal(result.skipped, true);
      assert.equal(fills, 1);
      assert.equal(clicks, 0);
    }
  }
});

test("实习僧等待目标新文档加载后才投递，不读取空白页或上一职位", async () => {
  for (const oldUrl of ["about:blank", "https://www.shixiseng.com/intern/inn_old"]) {
    const { context, run } = loadScript({ hostname: "www.shixiseng.com" });
    const targetUrl = "https://www.shixiseng.com/intern/inn_new";
    const oldDoc = {
      location: { href: oldUrl }, readyState: "complete",
      querySelector() { throw new Error("不能读取上一职位"); },
    };
    const loadingDoc = { location: { href: targetUrl }, readyState: "loading" };
    const session = { closed: false, location: { href: oldUrl }, document: oldDoc };
    let waits = 0, applications = 0, submissions = 0;
    const detail = { delivered: 0 };
    const dialog = {
      show: false,
      deliverOptions: { can_deliver: true, resume: [{ stype: "online", deliver_able: true }] },
    };
    const pageVm = { msg: detail, $store: { state: { isLogin: true } }, $refs: { deliverintern: dialog } };
    const commonDeliver = { chooseResume() {} };
    const applyButton = { innerText: "投递简历", click() { applications += 1; dialog.show = true; } };
    const submitButton = { innerText: "确认投递", click() { submissions += 1; detail.delivered = 1; } };
    const newDoc = {
      location: { href: targetUrl }, readyState: "complete",
      querySelector(selector) {
        if (selector === ".intern-detail-page") return { __vue__: pageVm };
        if (selector === ".common-deliver") return { __vue__: commonDeliver };
        if (selector === ".resume_apply") return applyButton;
        return null;
      },
      querySelectorAll(selector) {
        return selector === ".deliver-dialog-box .common-deliver__footer .btn" ? [submitButton] : [];
      },
    };
    context.sleep = async () => {
      waits += 1;
      if (waits === 2) session.document = loadingDoc;
      if (waits === 3) session.document = newDoc;
    };
    context.isElementVisible = () => true;
    context.isDisabled = () => false;
    run('config.shixisengResume = "online";');
    const result = await context.applyShixisengJob({ detailUrl: targetUrl }, session);
    assert.equal(result.ok, true);
    assert.equal(applications, 1);
    assert.equal(submissions, 1);
    assert.ok(waits >= 4);
  }
});

test("实习僧目标文档未到达时不处理旧页，新文档意外跳转时停止", async () => {
  for (const redirected of [false, true]) {
    const { context, run } = loadScript({ hostname: "www.shixiseng.com" });
    const oldDoc = {
      location: { href: "about:blank" }, readyState: "complete",
      querySelector() { throw new Error("不能处理旧文档"); },
    };
    const session = { closed: false, location: { href: "about:blank" }, document: oldDoc };
    context.clock = { now: 0 };
    run("Date.now = () => clock.now;");
    context.sleep = async () => {
      context.clock.now += 500;
      if (redirected) session.document = {
        location: { href: "https://www.shixiseng.com/login" }, readyState: "complete",
      };
    };
    const result = await context.applyShixisengJob({
      detailUrl: "https://www.shixiseng.com/intern/inn_new",
    }, session);
    assert.equal(result.ok, false);
    if (redirected) {
      assert.equal(result.limited, true);
      assert.match(result.message, /意外跳转/);
    } else {
      assert.match(result.message, /超时/);
    }
  }
});
