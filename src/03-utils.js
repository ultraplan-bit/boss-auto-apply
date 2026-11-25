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
    const seconds = randomBetween(DELAY_MIN_SEC, DELAY_MAX_SEC);
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
      // 元素可能来自同源 iframe，需要用它所在窗口计算样式。
      const view = element.ownerDocument?.defaultView || window;
      const style = view.getComputedStyle(element);
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

  function hasVisibleLoginSurface(doc = document) {
    if (!doc) return false;
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
      Array.from(doc.querySelectorAll(selector)).some(isElementVisible),
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

    const queue = [obj];
    const seen = new WeakSet([obj]);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (Object.prototype.hasOwnProperty.call(current, wantedKey))
        return current[wantedKey];
      if (queue.length >= 120) continue;
      // 先截取键，避免 Object.values 读取范围外的 Vue getter。
      for (const key of Object.keys(current).slice(0, 40)) {
        if (queue.length >= 120) break;
        const value = current[key];
        if (value && typeof value === "object" && !seen.has(value)) {
          seen.add(value);
          queue.push(value);
        }
      }
    }
    return undefined;
  }

  function findObjectByPredicate(seedList, predicate, maxDepth = 5) {
    const queue = [];
    const seen = new WeakSet();
    // ponytail: 只探测前 500 个对象；适配新版数据结构时优先补充直接数据入口。
    const enqueue = (value, depth) => {
      if (
        queue.length < 500 && value && typeof value === "object" &&
        !seen.has(value)
      ) {
        seen.add(value);
        queue.push({ value, depth });
      }
    };
    for (const value of seedList || []) enqueue(value, 0);

    for (let index = 0; index < queue.length; index += 1) {
      const { value, depth } = queue[index];
      if (predicate(value)) return value;
      if (depth >= maxDepth || queue.length >= 500) continue;

      for (const key of Object.keys(value).slice(0, 60)) {
        if (queue.length >= 500) break;
        enqueue(value[key], depth + 1);
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

  function collectVisibleText(selectors, extraFilter, doc = document) {
    const roots = [];
    const seenText = new Set();
    for (const selector of selectors) {
      for (const element of doc.querySelectorAll(selector)) {
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
        opened.length = 0;
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

  // Boss/猎聘/智联共用：优先滚动站内列表容器，再滚动整个页面。
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
