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
    // 外部投递和已申请职位已由 canApply / contact 在通用过滤中跳过。
    if (job.expired) {
      return { ok: false, skipped: true, message: "职位已下线，跳过" };
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
