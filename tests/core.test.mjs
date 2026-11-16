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

test("猎聘新会话必须唯一匹配岗位，不按窗口数量猜测", () => {
  const { context } = loadScript({ hostname: "www.liepin.com" });
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
