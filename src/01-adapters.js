// =====================================================================
  // 平台适配器
  // =====================================================================

  const ADAPTERS = {
    boss: {
      id: "boss",
      label: "Boss 直聘",
      onlineLabel: "仅在线 BOSS",
      exampleUrl: "https://www.zhipin.com/web/geek/job",
      isListPage: isBossJobPage,
      ensureLogin: ensureBossLogin,
      getCards: getBossJobCardElements,
      buildJob: buildBossJobDetail,
      fetchDetail: fetchBossJobDetail,
      // 活跃度和“已沟通”过滤依赖详情接口，即使没配置关键词也要抓取。
      alwaysFetchDetail: true,
      apply: applyBossJob,
      nextPage: goBossNextPageOrScroll,
      canApply: (job) =>
        Boolean(job?.securityId && job?.encryptJobId && job?.lid),
      noApplyReason: "缺少 securityId / encryptJobId / lid，无法调用投递接口",
      shouldSkip: bossShouldSkip,
      supportsOnlineFilter: true,
    },
    liepin: {
      id: "liepin",
      label: "猎聘",
      onlineLabel: "仅在线招聘者",
      exampleUrl: "https://www.liepin.com/zhaopin/",
      isListPage: isLiepinListPage,
      ensureLogin: ensureLiepinLogin,
      getCards: getLiepinJobCardElements,
      buildJob: buildLiepinJobDetail,
      fetchDetail: fetchLiepinJobDetail,
      apply: applyLiepinJob,
      nextPage: goLiepinNextPage,
      canApply: (job) =>
        Boolean(job?.actionAvailable || job?.detailUrl || job?.jobId),
      noApplyReason: "未找到聊一聊按钮（可能已沟通或岗位已关闭）",
      supportsOnlineFilter: true,
    },
    shixiseng: {
      id: "shixiseng",
      label: "实习僧",
      onlineLabel: "仅在线招聘者",
      exampleUrl: "https://www.shixiseng.com/interns",
      isListPage: isShixisengListPage,
      ensureLogin: ensureShixisengLogin,
      createApplySession: createShixisengApplySession,
      closeApplySession: closeShixisengApplySession,
      getCards: getShixisengJobCardElements,
      buildJob: buildShixisengJobDetail,
      fetchDetail: fetchShixisengJobDetail,
      apply: applyShixisengJob,
      nextPage: goShixisengNextPage,
      canApply: (job) => Boolean(job?.jobId && !job?.externalApply),
      noApplyReason: "缺少职位 ID 或该职位需前往外部网站投递",
      supportsOnlineFilter: true,
    },
    qiancheng: {
      id: "qiancheng",
      label: "前程无忧",
      onlineLabel: "仅在线招聘者",
      exampleUrl: "https://we.51job.com/pc/search",
      isListPage: isQianchengListPage,
      ensureLogin: ensureQianchengLogin,
      getCards: getQianchengJobCardElements,
      buildJob: buildQianchengJobDetail,
      fetchDetail: fetchQianchengJobDetail,
      apply: applyQianchengJob,
      nextPage: goQianchengNextPage,
      canApply: (job) => Boolean(job?.jobId && !job?.externalApply),
      noApplyReason: "缺少职位 ID 或该职位需前往官网投递",
      supportsOnlineFilter: true,
    },
    zhaopin: {
      id: "zhaopin",
      label: "智联招聘",
      onlineLabel: "仅在线 HR",
      exampleUrl: "https://sou.zhaopin.com/",
      isListPage: isZhaopinListPage,
      ensureLogin: ensureZhaopinLogin,
      getCards: getZhaopinJobCardElements,
      buildJob: buildZhaopinJobDetail,
      fetchDetail: fetchZhaopinJobDetail,
      apply: applyZhaopinJob,
      nextPage: goZhaopinNextPage,
      canApply: (job) =>
        Boolean(job?.applyAvailable || String(job?.applyType) === "1"),
      noApplyReason: "未找到立即投递按钮（可能已投递或需跳转外部投递）",
      supportsOnlineFilter: true,
    },
  };

  function getPlatformId() {
    const host = String(location.hostname || "");
    if (/(^|\.)zhipin\.com$/i.test(host)) return "boss";
    if (/(^|\.)liepin\.com$/i.test(host)) return "liepin";
    if (/(^|\.)zhaopin\.com$/i.test(host)) return "zhaopin";
    if (/(^|\.)51job\.com$/i.test(host)) return "qiancheng";
    if (/(^|\.)shixiseng\.com$/i.test(host)) return "shixiseng";
    return "unknown";
  }

  function getAdapter() {
    return ADAPTERS[getPlatformId()] || null;
  }

  // 平台自身的每日投递上限；智联招聘和前程无忧约为 100 次/天。
  const PLATFORM_DAILY_LIMITS = {
    zhaopin: 100,
    qiancheng: 100,
  };

  function getDailyLimit(adapter = getAdapter()) {
    const platformLimit = adapter ? PLATFORM_DAILY_LIMITS[adapter.id] : null;
    return Number.isFinite(platformLimit)
      ? Math.min(DAILY_LIMIT, platformLimit)
      : DAILY_LIMIT;
  }

  function isSupportedListPage() {
    const adapter = getAdapter();
    return Boolean(adapter && adapter.isListPage());
  }

  function getHistoryKey() {
    const platformId = getPlatformId();
    return platformId === "boss"
      ? HISTORY_KEY
      : `${APP_ID}:${platformId}:history`;
  }
