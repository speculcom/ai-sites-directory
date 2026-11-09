/* Directory filters: search, category chips, tag select. No remote calls, no accounts.
 * 2026-11-09：nav 回到「收藏夹」定位 —— 移除条件筛选与 2–3 项对照（该能力与 592 条里
 * 只有 10 条有条件数据不匹配），搜索改为首次输入时从卡片文本惰性建索引
 * （省掉每卡 data-blob 共 152 KB）。 */
(() => {
  'use strict';
  const q = document.getElementById('q');
  const tag = document.getElementById('tag');
  const empty = document.getElementById('empty');
  const counter = document.getElementById('filtered-count');
  const cards = [...document.querySelectorAll('.card-wrap')];
  const groups = [...document.querySelectorAll('.cat-group')];
  const chips = [...document.querySelectorAll('.chip')];
  const categories = new Set(chips.map((c) => c.dataset.cat));
  let activeCat = 'all';
  let index = null;

  const tr = (a, b) => (document.documentElement.lang.startsWith('en') ? b : a);

  /* 惰性索引：只有用户真的输入时才读 592 张卡的文本，避免首屏多一次遍历。 */
  const searchIndex = () => {
    if (!index) index = cards.map((c) => c.textContent.toLowerCase());
    return index;
  };

  function setCat(value) {
    activeCat = value || 'all';
    chips.forEach((c) => c.classList.toggle('is-on', c.dataset.cat === activeCat));
  }

  function apply() {
    const term = q.value.trim().toLowerCase();
    const idx = term ? searchIndex() : null;
    let n = 0;
    cards.forEach((c, i) => {
      const on =
        (activeCat === 'all' || c.dataset.cat === activeCat) &&
        (!tag.value || (c.dataset.tags || '').split(' ').includes(tag.value)) &&
        (!term || idx[i].includes(term));
      c.hidden = !on;
      if (on) n++;
    });
    for (const g of groups) g.hidden = ![...g.querySelectorAll('.card-wrap')].some((c) => !c.hidden);
    empty.hidden = n !== 0;
    if (counter) {
      counter.textContent = tr(
        `显示 ${n} / ${cards.length} 条`,
        `Showing ${n} / ${cards.length}`
      );
    }
  }

  function syncUrl(keepHash = false) {
    try {
      const u = new URL(location.href);
      const values = { q: q.value.trim(), cat: activeCat === 'all' ? '' : activeCat, tag: tag.value };
      for (const [k, v] of Object.entries(values)) {
        if (v) u.searchParams.set(k, v); else u.searchParams.delete(k);
      }
      u.searchParams.delete('compare');
      if (!keepHash) u.hash = '';
      history.replaceState(null, '', u);
    } catch (_) { /* file:// 等场景忽略 */ }
  }

  function selectValue(select, value) {
    if (value && ![...select.options].some((o) => o.value === value)) {
      const o = document.createElement('option');
      o.value = value; o.textContent = value; select.append(o);
    }
    select.value = value;
  }

  function resetFilters() {
    q.value = ''; tag.value = ''; setCat('all'); apply();
  }

  function readUrl() {
    const sp = new URLSearchParams(location.search);
    let hash = location.hash.slice(1);
    try { hash = decodeURIComponent(hash); } catch (_) {}
    const cat = sp.get('cat') || '';
    setCat(cat || (categories.has(hash) && hash) || 'all');
    q.value = (sp.get('q') || '').slice(0, 300);
    selectValue(tag, sp.get('tag') || '');
  }

  function scrollToAnchor() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return false; }
    if (!id || categories.has(id)) return false;
    const e = document.getElementById(id);
    if (!e) return false;
    if (e.closest('.card-wrap')) { resetFilters(); syncUrl(true); } else apply();
    for (let p = e.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
    e.scrollIntoView({ block: e.closest('.card-wrap') ? 'center' : 'start' });
    return true;
  }

  q.addEventListener('input', () => { apply(); syncUrl(); });
  tag.addEventListener('change', () => { apply(); syncUrl(); });
  chips.forEach((c) => c.addEventListener('click', () => { setCat(c.dataset.cat); apply(); syncUrl(); }));
  const reset = document.getElementById('directory-reset');
  if (reset) reset.addEventListener('click', () => { resetFilters(); syncUrl(); q.focus(); });
  window.addEventListener('hashchange', () => { readUrl(); apply(); scrollToAnchor(); });
  window.addEventListener('popstate', () => { readUrl(); apply(); scrollToAnchor(); });
  readUrl();
  apply();
  scrollToAnchor();
})();
