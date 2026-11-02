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

  async function applyBossJob(job) {
    const params = new URLSearchParams({
      securityId: job.securityId,
      jobId: job.encryptJobId,
      lid: job.lid,
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
    if (isChatRemind && !limited && config.treatChatRemindAsSuccess) {
      return {
        ok: true,
        softSuccess: true,
        message: chatRemindText || message || "开聊提醒",
        remainingQuota,
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
