/**
 * Shared table pagination - shows the first 7 records per page.
 * Auto-discovers every <table> (including ones injected later, e.g. modals)
 * and re-applies whenever rows re-render (search, sort, fetch, tab switches).
 */
(function () {
  "use strict";

  const PAGE_SIZE = 7;
  const seen = new WeakSet();
  let pendingNodes = [];
  let flushTimer = null;
  let discoverTimer = null;

  function setRowVisible(row, show) {
    row.style.display = show ? "" : "none";
  }

  function buildWrap(table) {
    const wrap = document.createElement("div");
    wrap.className = "table-pagination";
    wrap.setAttribute("hidden", "");
    wrap.setAttribute("data-page", "1");
    wrap._table = table;
    wrap.innerHTML =
      '<button type="button" class="table-pagination__btn" data-dir="-1" aria-label="Previous page" title="Previous page">&lsaquo;</button>' +
      '<span class="table-pagination__status" aria-live="polite"></span>' +
      '<button type="button" class="table-pagination__btn" data-dir="1" aria-label="Next page" title="Next page">&rsaquo;</button>';
    return wrap;
  }

  function getWrap(table) {
    let wrap = table._pagWrap;
    if (!wrap || !wrap.isConnected) {
      wrap = buildWrap(table);
      table._pagWrap = wrap;
      table.insertAdjacentElement("afterend", wrap);
    }
    return wrap;
  }

  function paginate(tbody) {
    if (!tbody || !tbody.closest) return;
    const table = tbody.closest("table");
    if (!table) return;

    const wrap = getWrap(table);
    const rows = tbody.rows;
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    let page = parseInt(wrap.getAttribute("data-page"), 10) || 1;
    if (page > pages) page = pages;
    if (page < 1) page = 1;
    wrap.setAttribute("data-page", String(page));

    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    for (let i = 0; i < total; i++) {
      setRowVisible(rows[i], i >= start && i < end);
    }

    const status = wrap.querySelector(".table-pagination__status");
    const prev = wrap.querySelector('.table-pagination__btn[data-dir="-1"]');
    const next = wrap.querySelector('.table-pagination__btn[data-dir="1"]');

    if (total > PAGE_SIZE) {
      if (status) status.textContent = start + 1 + "-" + Math.min(end, total) + " of " + total;
      wrap.removeAttribute("hidden");
    } else {
      wrap.setAttribute("hidden", "");
    }
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= pages;
  }

  function schedule(tbody, resetPage) {
    if (tbody._pagTimer) {
      clearTimeout(tbody._pagTimer);
      resetPage = resetPage || tbody._pagReset;
    }
    tbody._pagReset = resetPage;
    tbody._pagTimer = setTimeout(function () {
      tbody._pagTimer = null;
      tbody._pagReset = false;
      if (resetPage) {
        const table = tbody.closest("table");
        const wrap = table && table._pagWrap;
        if (wrap) wrap.setAttribute("data-page", "1");
      }
      paginate(tbody);
    }, 0);
  }

  function attach(tbody) {
    if (!tbody || seen.has(tbody)) return;
    seen.add(tbody);
    const observer = new MutationObserver(function () {
      schedule(tbody, true); // rows changed (fetch/search/sort/modal rebuild) -> back to page 1
    });
    observer.observe(tbody, { childList: true });
    schedule(tbody, false);
  }

  function discover(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    const tables = [];
    if (root.tagName === "TABLE") tables.push(root);
    const found = root.querySelectorAll("table");
    for (let i = 0; i < found.length; i++) tables.push(found[i]);
    for (let t = 0; t < tables.length; t++) {
      const bodies = tables[t].tBodies;
      if (bodies && bodies.length) attach(bodies[0]);
    }
  }

  function flush() {
    flushTimer = null;
    const batch = pendingNodes;
    pendingNodes = [];
    for (let i = 0; i < batch.length; i++) discover(batch[i]);
  }

  function onDocMutation(mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        if (added[j].nodeType === 1) pendingNodes.push(added[j]);
      }
    }
    if (pendingNodes.length && !flushTimer) flushTimer = setTimeout(flush, 0);
  }

  document.addEventListener("click", function (e) {
    const btn = e.target && e.target.closest ? e.target.closest(".table-pagination__btn") : null;
    if (!btn || btn.disabled) return;
    const wrap = btn.closest(".table-pagination");
    if (!wrap || wrap.hasAttribute("hidden")) return;
    const table = wrap._table;
    const tbody = table && table.tBodies && table.tBodies[0];
    if (!tbody) return;

    const dir = Number(btn.getAttribute("data-dir")) || 0;
    const pages = Math.max(1, Math.ceil(tbody.rows.length / PAGE_SIZE));
    let page = parseInt(wrap.getAttribute("data-page"), 10) || 1;
    page = Math.min(pages, Math.max(1, page + dir));
    wrap.setAttribute("data-page", String(page));
    paginate(tbody);

    const firstRow = tbody.rows[(page - 1) * PAGE_SIZE];
    if (firstRow && firstRow.scrollIntoView) {
      firstRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });

  function init() {
    discover(document);
    const observer = new MutationObserver(onDocMutation);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
