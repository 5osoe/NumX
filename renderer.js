// ═══════════════════════════════════════════
//  NumX — Renderer
//  Single source of truth for drawing.
//  Preview uses this. Export uses same math.
// ═══════════════════════════════════════════
'use strict';

const Renderer = (() => {

  // ── State ────────────────────────────────
  let _pdfDoc      = null;   // pdfjs document
  let _currentPage = 1;
  let _totalPages  = 0;
  let _scale       = 1.5;    // display scale (not export scale)
  let _pageW       = 0;      // rendered canvas width  (pixels)
  let _pageH       = 0;      // rendered canvas height (pixels)
  let _pdfPageW    = 0;      // PDF natural width  (pts)
  let _pdfPageH    = 0;      // PDF natural height (pts)
  let _renderTask  = null;

  // Font loading for preview canvas
  const _fontMap = {
    'Cairo':       "'Cairo', sans-serif",
    'Helvetica':   "Helvetica, Arial, sans-serif",
    'Times-Roman': "'Times New Roman', serif",
    'Courier':     "'Courier New', monospace",
  };

  // ── Initialize ────────────────────────────
  function init(pdfDoc) {
    _pdfDoc      = pdfDoc;
    _totalPages  = pdfDoc.numPages;
    _currentPage = 1;
  }

  // ── Getters ───────────────────────────────
  function totalPages()  { return _totalPages; }
  function currentPage() { return _currentPage; }
  function pageW()       { return _pageW; }
  function pageH()       { return _pageH; }
  function pdfPageW()    { return _pdfPageW; }
  function pdfPageH()    { return _pdfPageH; }
  function scale()       { return _scale; }

  // ── Zoom ─────────────────────────────────
  function setScale(s) { _scale = Math.max(0.4, Math.min(4, s)); }
  function fitScale(containerW, containerH) {
    if (!_pdfPageW || !_pdfPageH) return;
    const scaleW = (containerW  - 56) / _pdfPageW;
    const scaleH = (containerH  - 56) / _pdfPageH;
    _scale = Math.min(scaleW, scaleH, 2.5);
  }

  // ── Navigate ─────────────────────────────
  function goTo(n) {
    _currentPage = Math.max(1, Math.min(n, _totalPages));
  }

  // ── Render PDF page to canvas ────────────
  async function renderPage() {
    if (!_pdfDoc) return;
    const canvas  = document.getElementById('pdf-canvas');
    const ctx     = canvas.getContext('2d');

    const page    = await _pdfDoc.getPage(_currentPage);
    const vp      = page.getViewport({ scale: _scale });

    canvas.width  = vp.width;
    canvas.height = vp.height;
    _pageW  = vp.width;
    _pageH  = vp.height;

    // Store PDF point dimensions (at scale=1)
    const vp1     = page.getViewport({ scale: 1 });
    _pdfPageW = vp1.width;
    _pdfPageH = vp1.height;

    if (_renderTask) { _renderTask.cancel(); }
    _renderTask = page.render({ canvasContext: ctx, viewport: vp });
    try {
      await _renderTask.promise;
    } catch(e) {
      if (e.name !== 'RenderingCancelledException') throw e;
      return;
    }
    _renderTask = null;
  }

  // ── SHARED MATH: compute pixel position on canvas ──
  // el.x, el.y are percentages (0-100) of page
  // Returns {px, py} in canvas pixels
  function computePixelPos(el, canvasW, canvasH) {
    const px = (el.x / 100) * canvasW;
    const py = (el.y / 100) * canvasH;
    return { px, py };
  }

  // ── SHARED MATH: compute PDF point position ──
  // Returns {px, py} in PDF points (origin at bottom-left)
  function computePdfPos(el, pdfW, pdfH) {
    const px = (el.x / 100) * pdfW;
    const py = (1 - el.y / 100) * pdfH; // flip Y (PDF y=0 is bottom)
    return { px, py };
  }

  // ── Draw one element on a 2D canvas context ──
  // canvasW/H = size of the canvas in px
  // scale     = canvas scale factor (preview: _scale, export-canvas: 2)
  // This is the SINGLE rendering function used by both preview and safe-mode export.
  function drawElementOnCanvas(ctx, el, label, canvasW, canvasH, scale) {
    if (!el.visible) return;
    if (!label) return;

    const { px, py } = computePixelPos(el, canvasW, canvasH);
    const rot        = (el.rotation * Math.PI) / 180;
    const fontSize   = el.size * scale * 1.3333; // pt → px
    const fontFace   = _fontMap[el.font] || "'Cairo', sans-serif";

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);

    ctx.font      = `${el.weight} ${fontSize}px ${fontFace}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = el.direction === 'rtl' ? 'rtl' : 'ltr';

    const rgb   = Utils.hexToRgb255(el.textColor);
    ctx.globalAlpha = el.opacity;
    ctx.fillStyle   = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
    ctx.fillText(label, 0, 0);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ── Draw all elements on preview overlay canvas ──
  function drawOverlay(elements, totalPagesCount) {
    const canvas = document.getElementById('pdf-canvas');
    const W = canvas.width, H = canvas.height;

    // We draw ON TOP of pdf-canvas using an offscreen, then composite
    // Actually we use a separate overlay canvas approach
    // But simplest: draw directly onto main canvas by saving/restoring
    // Use the overlay DIV approach via HTML spans instead for drag support.
    // For the visual rendering, we draw onto the main canvas after PDF is drawn.

    const overlayCanvas = _getOrCreateOverlayCanvas(W, H);
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const pageIdx = _currentPage - 1;

    elements.forEach(el => {
      if (!el.visible) return;
      const label = Utils.buildLabel(pageIdx, el, totalPagesCount);
      if (!label) return;
      drawElementOnCanvas(ctx, el, label, W, H, _scale);
    });
  }

  function _getOrCreateOverlayCanvas(W, H) {
    let c = document.getElementById('overlay-canvas');
    if (!c) {
      c = document.createElement('canvas');
      c.id = 'overlay-canvas';
      c.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
      document.getElementById('page-inner').appendChild(c);
    }
    c.width  = W;
    c.height = H;
    return c;
  }

  // ── Drag handles ─────────────────────────
  // Render interactive drag handles for each element
  function renderHandles(elements, onDragUpdate) {
    const overlay  = document.getElementById('overlay-div');
    const pdfCanvas = document.getElementById('pdf-canvas');
    const W = pdfCanvas.width;
    const H = pdfCanvas.height;

    // Remove old handles
    overlay.querySelectorAll('.drag-handle').forEach(h => h.remove());

    const pageIdx     = Renderer.currentPage() - 1;
    const totalP      = Renderer.totalPages();
    const activeEl    = Elements.getActive();

    elements.forEach(el => {
      if (!el.visible) return;

      const { px, py } = computePixelPos(el, W, H);
      const isActive    = activeEl && el.id === activeEl.id;
      const label       = Utils.buildLabel(pageIdx, el, totalP) || '—';
      const cleanLabel  = label.replace(/[\u200E\u200F]/g, '');

      // Measure text to size the handle box
      const tempCanvas = document.createElement('canvas');
      const tCtx       = tempCanvas.getContext('2d');
      const fontSize    = el.size * _scale * 1.3333;
      const fontFace    = _fontMap[el.font] || "'Cairo', sans-serif";
      tCtx.font         = `${el.weight} ${fontSize}px ${fontFace}`;
      const tw          = tCtx.measureText(cleanLabel).width;
      const th          = fontSize * 1.2;

      const handle = document.createElement('div');
      handle.className  = 'drag-handle' + (isActive ? ' selected' : '');
      handle.dataset.id = el.id;
      handle.style.cssText = `
        left:${px}px; top:${py}px;
        width:${tw + 16}px; height:${th + 10}px;
        transform:translate(-50%,-50%) rotate(${el.rotation}deg);
      `;

      // Ring border (shows on hover/active)
      const ring = document.createElement('div');
      ring.className = 'handle-ring';
      ring.style.cssText = `
        inset:-4px; border-color:${el.color};
      `;

      // Indicator dot
      const dot = document.createElement('div');
      dot.className    = 'handle-dot';
      dot.style.background = el.color;

      handle.appendChild(ring);
      handle.appendChild(dot);
      overlay.appendChild(handle);

      // ── Drag behavior ──
      let isDragging = false;
      let startX, startY, startElX, startElY;

      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        Elements.setActive(el.id);
        Elements.renderList();
        Elements.syncSidebarToActive();

        isDragging = true;
        startX     = e.clientX;
        startY     = e.clientY;
        startElX   = el.x;
        startElY   = el.y;
        handle.classList.add('selected');
        document.body.style.cursor = 'grabbing';
      });

      const onMove = e => {
        if (!isDragging) return;
        const rect  = pdfCanvas.getBoundingClientRect();
        const dx    = e.clientX - startX;
        const dy    = e.clientY - startY;
        const newX  = Math.max(0, Math.min(100, startElX + (dx / rect.width)  * 100));
        const newY  = Math.max(0, Math.min(100, startElY + (dy / rect.height) * 100));

        el.x = parseFloat(newX.toFixed(2));
        el.y = parseFloat(newY.toFixed(2));

        // Live update handle position
        handle.style.left = `${(el.x / 100) * W}px`;
        handle.style.top  = `${(el.y / 100) * H}px`;

        if (onDragUpdate) onDragUpdate(el);
      };

      const onUp = () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
        if (onDragUpdate) onDragUpdate(el);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp, { once: true });
      handle.addEventListener('mouseup', () => {
        document.removeEventListener('mousemove', onMove);
        isDragging = false;
        document.body.style.cursor = '';
      });

      // Touch support
      handle.addEventListener('touchstart', e => {
        e.preventDefault();
        Elements.setActive(el.id);
        isDragging = true;
        const t = e.touches[0];
        startX   = t.clientX; startY = t.clientY;
        startElX = el.x; startElY = el.y;
      }, { passive: false });

      handle.addEventListener('touchmove', e => {
        e.preventDefault();
        if (!isDragging) return;
        const t    = e.touches[0];
        const rect = pdfCanvas.getBoundingClientRect();
        const dx   = t.clientX - startX;
        const dy   = t.clientY - startY;
        el.x = Math.max(0, Math.min(100, startElX + (dx / rect.width)  * 100));
        el.y = Math.max(0, Math.min(100, startElY + (dy / rect.height) * 100));
        handle.style.left = `${(el.x / 100) * W}px`;
        handle.style.top  = `${(el.y / 100) * H}px`;
        if (onDragUpdate) onDragUpdate(el);
      }, { passive: false });

      handle.addEventListener('touchend', () => { isDragging = false; });
    });
  }

  // ── Full preview update ───────────────────
  async function fullRender(elements) {
    await renderPage();
    drawOverlay(elements, _totalPages);
    renderHandles(elements, el => {
      // Sync sidebar sliders on drag
      const xSlider = document.getElementById('s-x');
      const ySlider = document.getElementById('s-y');
      if (xSlider) xSlider.value = el.x;
      if (ySlider) ySlider.value = el.y;
      document.getElementById('x-val').textContent   = el.x.toFixed(1) + '%';
      document.getElementById('y-val').textContent   = el.y.toFixed(1) + '%';
      document.getElementById('coord-x').textContent = el.x.toFixed(1) + '%';
      document.getElementById('coord-y').textContent = el.y.toFixed(1) + '%';
      document.getElementById('s-pos-preset').value  = 'custom';
      // Redraw overlay without full page re-render
      drawOverlay(elements, _totalPages);
    });
  }

  // Lightweight re-draw (no PDF re-render)
  function refreshOverlay(elements) {
    drawOverlay(elements, _totalPages);
    renderHandles(elements, el => {
      const xSlider = document.getElementById('s-x');
      const ySlider = document.getElementById('s-y');
      if (xSlider) xSlider.value = el.x;
      if (ySlider) ySlider.value = el.y;
      document.getElementById('x-val').textContent   = el.x.toFixed(1) + '%';
      document.getElementById('y-val').textContent   = el.y.toFixed(1) + '%';
      document.getElementById('coord-x').textContent = el.x.toFixed(1) + '%';
      document.getElementById('coord-y').textContent = el.y.toFixed(1) + '%';
      document.getElementById('s-pos-preset').value  = 'custom';
      drawOverlay(elements, _totalPages);
    });
  }

  return {
    init, totalPages, currentPage, pageW, pageH, pdfPageW, pdfPageH, scale,
    setScale, fitScale, goTo,
    renderPage, drawOverlay, renderHandles, fullRender, refreshOverlay,
    computePixelPos, computePdfPos,
    drawElementOnCanvas,
    _fontMap,
  };
})();
