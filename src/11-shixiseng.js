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
    if (!config.shixisengResume) {
      return { ok: false, reason: "请先在面板中选择实习僧投递简历。" };
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
        // 去掉实习僧用于反爬的私有区字体字符。
        textarea.value.replace(
          /[\uE000-\uF8FF\u{F0000}-\u{10FFFD}]/gu,
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

    const target = new URL(targetUrl);
    let previousDoc;
    try {
      previousDoc = session.document;
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
        // 导航未完成时仍能读到旧文档，不能用上一职位的状态判定本次结果。
        if (
          detailDoc === previousDoc ||
          detailDoc.readyState === "loading" ||
          detailDoc.location.href === "about:blank"
        ) continue;
        const loadedUrl = new URL(detailDoc.location.href);
        if (
          loadedUrl.origin !== target.origin ||
          loadedUrl.pathname !== target.pathname
        ) {
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
