// =====================================================================
  // 断点续跑
  // =====================================================================

  function resumePendingRun() {
    const saved = takeResumeState();
    if (!saved) return false;
    const adapter = getAdapter();
    if (!adapter || !adapter.isListPage()) return false;

    log("warn", "检测到上次任务在翻页时中断，正在自动继续…");
    window.setTimeout(() => {
      startApply({ resume: saved }).catch((error) => {
        state.running = false;
        state.stopping = false;
        state.current = "续跑异常";
        log("error", `续跑异常：${error.message || error}`);
      });
    }, 1200);
    return true;
  }

  // =====================================================================
  // 菜单与路由
  // =====================================================================

  function registerMenuCommands() {
    try {
      if (typeof GM_registerMenuCommand !== "function") return;
      const adapter = getAdapter();
      const label = adapter?.label || "招聘网站";
      GM_registerMenuCommand(`显示/隐藏 ${label} 自动投递面板`, () => {
        if (!cachedPanel) mountPanel();
        state.collapsed = !state.collapsed;
        renderPanel();
      });
      GM_registerMenuCommand(`停止 ${label} 自动投递`, stopApply);
    } catch (error) {
      console.warn(`[${APP_ID}] register menu failed`, error);
    }
  }

  function installRouteWatcher() {
    const rerender = () => {
      window.setTimeout(() => {
        if (isSupportedListPage()) {
          mountPanel();
          return;
        }
        // 新版页面路由切换后列表可能异步渲染，再补一次检测。
        window.setTimeout(() => {
          if (isSupportedListPage()) mountPanel();
        }, 1200);
      }, 500);
    };

    const rawPushState = history.pushState;
    history.pushState = function patchedPushState(...args) {
      const result = rawPushState.apply(this, args);
      rerender();
      return result;
    };

    const rawReplaceState = history.replaceState;
    history.replaceState = function patchedReplaceState(...args) {
      const result = rawReplaceState.apply(this, args);
      rerender();
      return result;
    };

    window.addEventListener("popstate", rerender);
  }

  function bootstrap(attempt = 0) {
    const adapter = getAdapter();
    if (!adapter) return;

    if (attempt === 0) {
      // 先安装菜单和路由监听：即使当前路径不认识，SPA 跳转到列表页后也能挂载面板。
      registerMenuCommands();
      installRouteWatcher();
    }

    if (!adapter.isListPage()) {
      // 新版页面可能异步渲染列表，稍后重试几次。
      if (attempt < 6) {
        window.setTimeout(() => bootstrap(attempt + 1), 800);
      }
      return;
    }

    mountPanel();
    log("success", `${adapter.label} 脚本已加载（v${VERSION}）。`);
    window.setTimeout(() => resumePendingRun(), 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bootstrap(), {
      once: true,
    });
  } else {
    bootstrap();
  }
