// ═══════════════════════════════════════════
//  NumX — Utilities
// ═══════════════════════════════════════════
'use strict';

const Utils = (() => {

  // ── DOM helpers ──────────────────────────
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  // ── Toast ────────────────────────────────
  let _toastTimer;
  function toast(msg, ms = 2800) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ── Loader ───────────────────────────────
  function showLoader(text = 'Processing…', pct = 0) {
    $('loader').style.display = 'flex';
    $('loader-text').textContent = text;
    setProgress(pct);
  }
  function hideLoader() { $('loader').style.display = 'none'; }
  function setProgress(pct) { $('loader-fill').style.width = pct + '%'; }
  function loaderText(t) { $('loader-text').textContent = t; }

  // ── Number formatting ────────────────────
  function toArabicIndic(n) {
    return String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  }

  function toRoman(n) {
    if (n <= 0) return String(n);
    const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
    const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I'];
    let result = '';
    for (let i = 0; i < vals.length; i++) {
      while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
    }
    return result;
  }

  function formatNum(n, { padding, numerals }) {
    let s;
    if (numerals === 'roman') {
      s = toRoman(Math.max(1, n));
    } else if (numerals === 'arabic-indic') {
      s = padding > 0
        ? toArabicIndic(String(n).padStart(padding, '0'))
        : toArabicIndic(n);
    } else {
      s = padding > 0 ? String(n).padStart(padding, '0') : String(n);
    }
    return s;
  }

  // Build the display label for page at 0-based index
  function buildLabel(pageIndex, el, totalPages) {
    if (!shouldNumber(pageIndex, el)) return null;

    const offset = numberingOffset(pageIndex, el);
    const n = el.startNum + offset * el.increment;
    const numStr = formatNum(n, el);

    const total = formatNum(totalPages, el);
    let template = el.format === 'custom' ? (el.customFormat || '{n}') : el.format;
    let label = template
      .replace('{n}', numStr)
      .replace('{total}', total);

    // RTL/Arabic direction fix: prevent numeral reversal
    if (el.direction === 'rtl' || el.numerals === 'arabic-indic') {
      label = '\u200F' + label + '\u200F';
    } else {
      label = '\u200E' + label;
    }
    return label;
  }

  // Should this page (0-based) receive numbering?
  function shouldNumber(idx, el) {
    const page = idx + 1; // 1-based
    const from = el.fromPage || 1;
    const to   = (el.toPage && el.toPage > 0) ? el.toPage : Infinity;
    if (page < from || page > to) return false;

    const apply = el.applyTo || 'all';
    if (apply === 'odd'  && page % 2 === 0) return false;
    if (apply === 'even' && page % 2 !== 0) return false;

    // Skip pattern
    const skip = parseInt(el.skipPattern) || 1;
    if (skip > 1) {
      const rel = page - from; // 0-based from start
      if (rel % skip !== 0) return false;
    }

    return true;
  }

  // How many numbered pages came before this page (determines n)
  function numberingOffset(targetIdx, el) {
    let count = 0;
    for (let i = 0; i < targetIdx; i++) {
      if (shouldNumber(i, el)) count++;
    }
    return count;
  }

  // ── Color helpers ────────────────────────
  function hexToRgb01(hex) {
    const v = hex.replace('#', '');
    return {
      r: parseInt(v.slice(0,2), 16) / 255,
      g: parseInt(v.slice(2,4), 16) / 255,
      b: parseInt(v.slice(4,6), 16) / 255
    };
  }

  function hexToRgb255(hex) {
    const c = hexToRgb01(hex);
    return { r: Math.round(c.r*255), g: Math.round(c.g*255), b: Math.round(c.b*255) };
  }

  // ── Debounce ─────────────────────────────
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ── Expose ──────────────────────────────
  return {
    $, $$,
    toast, showLoader, hideLoader, setProgress, loaderText,
    formatNum, buildLabel, shouldNumber,
    hexToRgb01, hexToRgb255,
    debounce,
  };
})();
