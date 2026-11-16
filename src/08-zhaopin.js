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

      const pageState = getPageGlobal("__INITIAL_STATE__");
      if (pageState && pageState.hasMore === false) return false;
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
