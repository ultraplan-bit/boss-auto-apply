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
    if (!isElementVisible(element)) return false;
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
            isElementVisible(element) &&
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
      if (!isElementVisible(frame)) return;

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
  let liepinImSnapshot = new WeakMap();

  function snapshotLiepinImWidgetsInDocument(docs) {
    const docList = Array.isArray(docs) ? docs : [docs];
    const widgets = [];
    const seenEditors = new Set();
    liepinImSnapshot = new WeakMap();
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
    // ponytail: 标题名称匹配仍是启发式，站点提供稳定招聘者 ID 时改用 ID。
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
    const targets = widgets.filter(
      (widget) =>
        isNewLiepinConversation(widget, liepinImSnapshot.get(widget.editor)) &&
        liepinWidgetMatchesJob(widget, job),
    );
    return targets.length === 1 ? targets[0] : null;
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
        currentDocs.some((doc) => hasVisibleLoginSurface(doc))
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
      const widgetSummary = widgets.slice(0, 8).map((widget) =>
        `${widget.heading.slice(0, 80)} [${String(widget.root.className || "").slice(0, 120)}]`,
      ).join("；");
      log("debug", `IM 新会话检测超时：会话 ${widgets.length}，容器 ${states.reduce((total, state) => total + state.rootsSeen, 0)}，不可读 iframe ${inaccessibleFrames}${widgetSummary ? `；${widgetSummary}` : ""}`);
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
        isElementVisible(element) && !isDisabled(element),
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
        isElementVisible(element) &&
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
      if (!isElementVisible(row)) continue;

      const hint = `${row.className} ${row.getAttribute("data-status") || ""}`;
      const hasErrorIcon = Array.from(
        row.querySelectorAll(
          '[class*="fail"], [class*="error"], [class*="loadingicon"]',
        ),
      ).some((element) => isElementVisible(element));
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
          hasVisibleLoginSurface(doc)
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
    if (state.incoming.length) {
      return {
        ok: false,
        skipped: true,
        message: "招聘方已有回复，属于此前已沟通，跳过重复打招呼",
      };
    }
    if (state.matching.length) {
      return { ok: true, message: "招呼已发送" };
    }
    if (state.defaultOutgoing.length) {
      return { ok: true, message: "平台已自动发送默认招呼" };
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
        log("debug", `聊天输入框未找到：${String(root.className || "").slice(0, 120)} ${root.tagName}`);
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
        log(
          "debug",
          `发送按钮未找到：${state.editor?.tagName || ""} ${String(state.editor?.className || "").slice(0, 120)} ${String(root.className || "").slice(0, 120)}`,
        );
      }
      return { ok: false, message: "未找到发送按钮，请人工核对" };
    }

    // 点发送前再核对一次：避免平台在输入期间自动发了招呼，造成重复消息。
    state = readLiepinChatState(root, doc);
    if (state.incoming.length) {
      return {
        ok: false,
        skipped: true,
        message: "招聘方已有回复，跳过重复打招呼",
      };
    }
    if (state.matching.length || state.defaultOutgoing.length) {
      return { ok: true, message: "平台已自动发送默认招呼" };
    }
    if (state.nonDefaultOutgoing.length) {
      // 填写期间平台自动发出了招呼语，不再补发。
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
      log(
        "debug",
        `招呼发送未确认：本人消息 ${outgoingBefore} -> ${lastState.outgoing.length}，匹配 ${lastState.matching.length}，默认招呼 ${lastState.defaultOutgoing.length}，招聘方回复 ${lastState.incoming.length}，输入内容 ${lastState.editorText.slice(0, 80)}`,
      );
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
        isElementVisible(candidate),
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
        if (!isElementVisible(element)) continue;
        push(element, text);
      }
    }
    for (const element of doc.querySelectorAll("button, a, [role='button']")) {
      const text = normalizeText(
        element.innerText || element.textContent || "",
      );
      if (!isChatLabel(text)) continue;
      if (!isElementVisible(element)) continue;
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

  // 聊天窗口本身（含输入框）不是平台提示；否则聊天内容里的
  // “验证码/登录”等业务词会被误判成风控并中断整个投递。
  function isLiepinChatSurface(element) {
    return Boolean(
      element.querySelector('textarea, [contenteditable], [role="textbox"]'),
    );
  }

  function readLiepinFeedbackFromDocument(doc) {
    if (!doc) return [];
    return collectVisibleText(
      LIEPIN_FEEDBACK_SELECTORS,
      (text, element) =>
        !isLiepinChatSurface(element) &&
        /沟通|投递|登录|验证|上限|会员|频繁|异常|成功|失败/.test(text),
      doc,
    );
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
    return collectVisibleText(
      selectors,
      (text, element) => text.length <= 500 && !isLiepinChatSurface(element),
      doc,
    ).map((item) => item.text);
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
    const framePopups = new Set();
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (restoreFramePopupWatch) restoreFramePopupWatch();
      for (const popup of framePopups) {
        try {
          popup.close();
        } catch (error) {
          // ignore
        }
      }
      framePopups.clear();
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
        ).find((element) => isElementVisible(element));
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
          hasVisibleLoginSurface(doc)
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
                isElementVisible(element) &&
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
          if (popup) framePopups.add(popup);
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
        if (framePopups.size) break;
        // “正在初始化”可以多试两次；普通超时只补点一次，避免无入口岗位拖太久。
        const canRetry = found.error.transient ? attempt < 2 : attempt === 0;
        if (!canRetry) break;
      }
      found = found || {
        error: { ok: false, message: "点击后未打开聊天窗口" },
      };
      if (found.error) {
        if (framePopups.size) {
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
      popupWatch.closeAll();
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
