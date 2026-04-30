// ═══════════════════════════════════════════
//  NumX — Application Controller
// ═══════════════════════════════════════════
'use strict';

// ── PDF.js worker ─────────────────────────
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── App state ─────────────────────────────
const App = {
  pdfBytes:   null,
  pdfDoc_js:  null,  // pdfjs document for rendering + safe export
  fileName:   '',
  totalPages: 0,

  // Debounced overlay refresh
  _refreshTimer: null,
  scheduleRefresh() {
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => this.refreshOverlay(), 60);
  },

  refreshOverlay() {
    if (!this.pdfDoc_js) return;
    Renderer.refreshOverlay(Elements.getAll());
    Elements.renderList();
  },
};

// ── On elements change → refresh overlay ──
Elements.setChangeCallback(() => {
  App.scheduleRefresh();
});

// ── File loading ──────────────────────────
async function loadFile(file) {
  if (!file || !/\.pdf$/i.test(file.name)) {
    Utils.toast('Please select a PDF file'); return;
  }

  Utils.showLoader('Opening PDF…', 10);

  try {
    const bytes   = await file.arrayBuffer();
    App.pdfBytes  = new Uint8Array(bytes);
    App.fileName  = file.name;

    // Load with pdfjs (copy so pdf-lib can use original bytes)
    const copy    = App.pdfBytes.slice(0);
    App.pdfDoc_js = await pdfjsLib.getDocument({ data: copy }).promise;
    App.totalPages = App.pdfDoc_js.numPages;

    Renderer.init(App.pdfDoc_js);

    // Update top bar
    Utils.$('file-badge').textContent = file.name;
    Utils.$('page-total').textContent = '/ ' + App.totalPages;
    Utils.$('page-input').max  = App.totalPages;
    Utils.$('page-input').value = 1;
    Utils.$('page-nav').style.display = 'flex';
    Utils.$('btn-export').disabled = false;

    // Show preview
    Utils.$('drop-zone').classList.add('hidden');
    Utils.$('preview-container').style.display = 'flex';

    Utils.setProgress(40);

    // Fit scale to window
    const area = Utils.$('canvas-area');
    Renderer.fitScale(area.clientWidth, area.clientHeight);
    updateZoomLabel();

    Utils.setProgress(60);

    // Render first page
    await Renderer.fullRender(Elements.getAll());

    Utils.setProgress(100);
    Utils.hideLoader();
    Utils.toast('📄 ' + file.name + ' loaded');

  } catch(e) {
    Utils.hideLoader();
    Utils.toast('❌ Failed to load PDF: ' + e.message);
    console.error(e);
  }
}

// ── Zoom ──────────────────────────────────
function updateZoomLabel() {
  Utils.$('zoom-label').textContent = Math.round(Renderer.scale() * 100 / 1.5 * 100) + '%';
}

async function zoom(delta) {
  Renderer.setScale(Renderer.scale() + delta * 0.25);
  updateZoomLabel();
  await Renderer.fullRender(Elements.getAll());
}

async function zoomFit() {
  const area = Utils.$('canvas-area');
  Renderer.fitScale(area.clientWidth, area.clientHeight);
  updateZoomLabel();
  await Renderer.fullRender(Elements.getAll());
}

// ── Page navigation ───────────────────────
async function goToPage(n) {
  Renderer.goTo(n);
  Utils.$('page-input').value = Renderer.currentPage();
  await Renderer.fullRender(Elements.getAll());
}

// ── Export ────────────────────────────────
async function doExport() {
  if (!App.pdfBytes) return;
  const safeMode = Utils.$('safe-mode').checked;
  const elements = Elements.getAll().filter(e => e.visible);
  if (!elements.length) { Utils.toast('No visible elements to stamp'); return; }

  try {
    if (safeMode) {
      await Exporter.exportSafe(App.pdfDoc_js, Elements.getAll(), App.totalPages, App.fileName);
    } else {
      await Exporter.exportDirect(App.pdfBytes, Elements.getAll(), App.totalPages, App.fileName);
    }
  } catch(e) {
    Utils.hideLoader();
    Utils.toast('❌ Export error: ' + e.message);
    console.error(e);
  }
}

// ── Wire UI ───────────────────────────────
function wireUI() {

  // File input
  const fileInput = Utils.$('file-input');
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) { loadFile(e.target.files[0]); fileInput.value = ''; }
  });

  Utils.$('btn-upload').addEventListener('click', () => fileInput.click());
  Utils.$('btn-dz-open').addEventListener('click', () => fileInput.click());

  // Drag & drop on drop card
  const dzTarget = Utils.$('dz-target');
  ['dragover','dragenter'].forEach(ev => {
    dzTarget.addEventListener(ev, e => { e.preventDefault(); dzTarget.classList.add('drag-over'); });
  });
  ['dragleave','dragend'].forEach(ev => {
    dzTarget.addEventListener(ev, () => dzTarget.classList.remove('drag-over'));
  });
  dzTarget.addEventListener('drop', e => {
    e.preventDefault(); dzTarget.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });
  dzTarget.addEventListener('click', e => {
    if (e.target === dzTarget) fileInput.click();
  });

  // Also allow drop anywhere in the canvas area
  Utils.$('canvas-area').addEventListener('dragover', e => e.preventDefault());
  Utils.$('canvas-area').addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  // Page navigation
  Utils.$('btn-prev').addEventListener('click', () => goToPage(Renderer.currentPage() - 1));
  Utils.$('btn-next').addEventListener('click', () => goToPage(Renderer.currentPage() + 1));
  Utils.$('page-input').addEventListener('change', e => goToPage(parseInt(e.target.value) || 1));

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (!App.pdfDoc_js) return;
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    goToPage(Renderer.currentPage() - 1);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  goToPage(Renderer.currentPage() + 1);
  });

  // Zoom
  Utils.$('btn-zoom-in').addEventListener('click', () => zoom(1));
  Utils.$('btn-zoom-out').addEventListener('click', () => zoom(-1));
  Utils.$('btn-zoom-fit').addEventListener('click', zoomFit);

  // Export
  Utils.$('btn-export').addEventListener('click', doExport);

  // Wire sidebar element controls
  Elements.wireSidebar();

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ── Init ──────────────────────────────────
function init() {
  wireUI();

  // Create default element
  Elements.add();
  Elements.renderList();
  Elements.syncSidebarToActive();

  console.log(
    '%cNumX v2.0 — Professional PDF Numbering\nhttps://qnest.app',
    'color:#3b82f6;font-weight:700;font-size:13px'
  );
}

document.addEventListener('DOMContentLoaded', init);
