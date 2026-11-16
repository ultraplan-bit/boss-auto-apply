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

  // 面板骨架和表单只渲染一次；运行中只更新状态、统计和日志，
  // 避免整块重绘打断正在输入的关键词。
  function renderPanel() {
    if (!cachedPanel) return;
    const adapter = getAdapter();
    if (!cachedPanel.firstElementChild) renderPanelSkeleton(adapter);

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

    const part = (selector) => cachedPanel.querySelector(selector);
    part('[data-role="subtitle"]').textContent =
      `v${VERSION} · ${runningText} · 今日已投 ${history.dailyCount}/${dailyLimit}${quotaText}`;
    part('[data-action="toggle-collapse"]').textContent = state.collapsed
      ? "展开"
      : "收起";
    part('[data-role="stats"]').innerHTML = [
      [state.scanned, "扫描"],
      [state.matched, "匹配"],
      [state.applied, "成功"],
      [state.skipped, "跳过"],
      [state.failed, "失败"],
    ]
      .map(
        ([value, label]) =>
          `<div class="aj-stat"><b>${value}</b><span>${label}</span></div>`,
      )
      .join("");
    part('[data-role="current"]').textContent = `当前：${state.current}`;
    part('[data-action="start"]').disabled = state.running;
    part('[data-action="stop"]').disabled = !state.running;
    part('[data-role="logs"]').innerHTML = logsHtml;
  }

  function renderPanelSkeleton(adapter) {
    const title = adapter ? `${adapter.label} 自动投递助手` : "自动投递助手";
    cachedPanel.innerHTML = `
      <div class="aj-header">
        <div>
          <div class="aj-title">${htmlEscape(title)}</div>
          <div class="aj-subtitle" data-role="subtitle"></div>
        </div>
        <button class="aj-icon-btn" data-action="toggle-collapse"></button>
      </div>
      <div class="aj-body">
        <div class="aj-status" data-role="stats"></div>
        <div class="aj-current" data-role="current"></div>
        <form class="aj-form" data-role="config-form"></form>
        <div class="aj-actions">
          <button class="aj-btn aj-btn-primary" data-action="start">开始</button>
          <button class="aj-btn aj-btn-danger" data-action="stop">停止</button>
        </div>
        <div class="aj-logs" data-role="logs"></div>
      </div>
    `;
    renderConfigForm();
  }

  function renderConfigForm() {
    const form = cachedPanel?.querySelector('[data-role="config-form"]');
    if (!form) return;
    const adapter = getAdapter();
    const onlineLabel = adapter?.onlineLabel || "仅在线 BOSS";
    // 平台专属设置只在对应平台显示，避免影响其它平台的面板。
    const liepinGreetingField =
      adapter?.id === "liepin"
        ? textAreaHtml("liepinGreeting", "猎聘招呼语（未自动发送时补发）")
        : "";
    const bossImageResumeSettings =
      adapter?.id === "boss" ? renderBossImageResumeSettings() : "";
    const shixisengSettings =
      adapter?.id === "shixiseng" ? renderShixisengSettings() : "";

    form.innerHTML = `
      <div class="aj-checks">
        ${checkboxHtml("onlyOnlineBoss", onlineLabel)}
        ${checkboxHtml("debug", "调试日志")}
      </div>
      ${textAreaHtml("includeDescriptionKeywords", "岗位详情包含关键词")}
      ${textAreaHtml("excludeDescriptionKeywords", "岗位详情排除关键词")}
      ${liepinGreetingField}
      ${bossImageResumeSettings}
      ${shixisengSettings}
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
      renderConfigForm();
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
      renderConfigForm();
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
