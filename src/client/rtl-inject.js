(function () {
  if (window.__agyRtlInjected) return;
  window.__agyRtlInjected = true;

  const RTL_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  const EXCLUDE_SELECTOR = 'pre, code, kbd, samp, button, svg, nav, header, footer, select, label, .monaco-editor, [role="button"], [role="toolbar"], [role="tablist"], [role="tab"], [role="menubar"], [role="menu"]';
  const PROSE_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, summary, ul, ol, .whitespace-pre-wrap';
  const INPUT_SELECTOR = 'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"]';

  let state = {
    enabled: false,
    mode: 'force-rtl',
    lineHeight: 0
  };

  let observer = null;
  let rafScheduled = false;

  function isExcluded(el) {
    if (!el || el.nodeType !== 1) return true;
    return Boolean(el.closest(EXCLUDE_SELECTOR));
  }

  function hasDirectText(el) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim().length > 0) {
        return true;
      }
    }
    return false;
  }

  function extractNonCodeText(el) {
    if (!el) return '';
    if (el.matches && el.matches('textarea, input')) {
      return el.value || '';
    }
    let text = '';
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (parent && parent.closest('pre, code, kbd, samp, button, svg, .monaco-editor')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let curr;
    while ((curr = walker.nextNode())) {
      text += curr.nodeValue || '';
    }
    return text;
  }

  function clearElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.hasAttribute('data-agy-rtl')) {
      el.removeAttribute('data-agy-rtl');
    }
    if (el.hasAttribute('data-agy-rtl-dir')) {
      const prev = el.getAttribute('data-agy-rtl-prev-dir');
      if (prev !== null && prev !== '') {
        el.setAttribute('dir', prev);
      } else {
        el.removeAttribute('dir');
      }
      el.removeAttribute('data-agy-rtl-dir');
      el.removeAttribute('data-agy-rtl-prev-dir');
    }
  }

  function clearAll() {
    document.documentElement.classList.remove('agy-rtl-active', 'agy-rtl-lh');
    document.documentElement.style.removeProperty('--agy-rtl-line-height');
    const touched = document.querySelectorAll('[data-agy-rtl], [data-agy-rtl-dir]');
    for (let i = 0; i < touched.length; i++) {
      clearElement(touched[i]);
    }
  }

  function applyDirection(el, dirValue) {
    if (!el.hasAttribute('data-agy-rtl-dir')) {
      const prev = el.getAttribute('dir');
      el.setAttribute('data-agy-rtl-prev-dir', prev === null ? '' : prev);
      el.setAttribute('data-agy-rtl-dir', '1');
    }
    if (el.getAttribute('data-agy-rtl') !== dirValue) {
      el.setAttribute('data-agy-rtl', dirValue);
    }
    if (el.getAttribute('dir') !== dirValue) {
      el.setAttribute('dir', dirValue);
    }
  }

  function resolveTargetDirection(el, mode) {
    if (mode === 'force-rtl') return 'rtl';
    if (mode === 'force-ltr') return 'ltr';
    if (mode === 'auto') return 'auto';
    if (mode === 'smart-rtl') {
      return RTL_REGEX.test(extractNonCodeText(el)) ? 'rtl' : 'ltr';
    }
    return 'rtl';
  }

  function processElement(el) {
    if (isExcluded(el)) return;
    const mode = state.mode || 'force-rtl';
    const isInput = el.matches(INPUT_SELECTOR);
    const isProse = el.matches(PROSE_SELECTOR);

    if (isInput || isProse) {
      applyDirection(el, resolveTargetDirection(el, mode));
      return;
    }

    if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && hasDirectText(el)) {
      if (mode === 'smart-rtl' || mode === 'force-rtl') {
        if (RTL_REGEX.test(extractNonCodeText(el))) {
          applyDirection(el, 'rtl');
        }
      } else if (mode === 'force-ltr') {
        if (RTL_REGEX.test(extractNonCodeText(el))) {
          applyDirection(el, 'ltr');
        }
      } else if (mode === 'auto') {
        if (RTL_REGEX.test(extractNonCodeText(el))) {
          applyDirection(el, 'auto');
        }
      }
    }
  }

  function applyAll() {
    if (!document.body) return;

    if (!state.enabled) {
      clearAll();
      return;
    }

    document.documentElement.classList.add('agy-rtl-active');
    if (typeof state.lineHeight === 'number' && state.lineHeight > 0) {
      document.documentElement.classList.add('agy-rtl-lh');
      document.documentElement.style.setProperty('--agy-rtl-line-height', String(state.lineHeight));
    } else {
      document.documentElement.classList.remove('agy-rtl-lh');
      document.documentElement.style.removeProperty('--agy-rtl-line-height');
    }

    const candidates = document.querySelectorAll(`${PROSE_SELECTOR}, ${INPUT_SELECTOR}, div, span`);
    for (let i = 0; i < candidates.length; i++) {
      processElement(candidates[i]);
    }
  }

  function scheduleApply() {
    if (!state.enabled || rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      applyAll();
    });
  }

  function ensureObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(() => {
      if (state.enabled) {
        scheduleApply();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
    document.body.addEventListener('input', (evt) => {
      if (!state.enabled) return;
      const target = evt.target;
      if (target && target.matches && target.matches(INPUT_SELECTOR)) {
        processElement(target);
      }
    }, true);
  }

  let lastMode = state.mode;

  function applyState(next) {
    if (!next || typeof next !== 'object') return;
    const nextMode = next.mode || 'force-rtl';
    const modeChanged = lastMode !== nextMode;
    lastMode = nextMode;
    state = {
      enabled: Boolean(next.enabled),
      mode: nextMode,
      lineHeight: Number(next.lineHeight) || 0
    };
    if (document.body) {
      ensureObserver();
      if (modeChanged && state.enabled) {
        clearAll();
      }
      applyAll();
    }
  }

  function init() {
    if (window.__AGY_RTL_INITIAL_STATE__) {
      applyState(window.__AGY_RTL_INITIAL_STATE__);
    }

    fetch('/__agy_rtl__/state', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) applyState(data);
      })
      .catch(() => {});

    if (typeof EventSource === 'function') {
      const connectSse = () => {
        const es = new EventSource('/__agy_rtl__/events');
        es.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            applyState(parsed);
          } catch {}
        };
        es.onerror = () => {
          es.close();
          setTimeout(connectSse, 2000);
        };
      };
      connectSse();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
