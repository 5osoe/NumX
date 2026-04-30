// ═══════════════════════════════════════════
//  NumX — Export Engine
//
//  Uses the SAME coordinate math as Renderer.
//  Two modes:
//    direct  → pdf-lib text drawing (fast, lossless)
//    safe    → canvas rasterization (handles all fonts)
// ═══════════════════════════════════════════
'use strict';

const Exporter = (() => {

  // ── Helpers ──────────────────────────────
  function downloadBytes(bytes, name) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function buildName(original) {
    return original.replace(/\.pdf$/i, '') + '_numbered.pdf';
  }

  // ── Font map for canvas (safe mode) ──────
  const _canvasFontMap = {
    'Cairo':       "'Cairo', sans-serif",
    'Helvetica':   "Helvetica, Arial, sans-serif",
    'Times-Roman': "'Times New Roman', serif",
    'Courier':     "'Courier New', monospace",
  };

  // ── pdf-lib standard fonts ────────────────
  function stdFont(name) {
    const { StandardFonts } = PDFLib;
    const map = {
      'Helvetica':   StandardFonts.Helvetica,
      'Times-Roman': StandardFonts.TimesRoman,
      'Courier':     StandardFonts.Courier,
    };
    return map[name] || null;
  }

  function needsCanvasFallback(el) {
    // Cairo and Arabic-indic numerals need canvas rendering
    if (el.font === 'Cairo' || el.font === 'Amiri') return true;
    if (el.numerals === 'arabic-indic') return true;
    const fmt = el.format === 'custom' ? el.customFormat : el.format;
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(fmt)) return true;
    return false;
  }

  // ── DIRECT EXPORT (pdf-lib) ──────────────
  async function exportDirect(pdfBytes, elements, totalPages, fileName) {
    const { PDFDocument, rgb, degrees } = PDFLib;
    Utils.showLoader('Embedding page numbers…', 5);

    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages  = pdfDoc.getPages();

    // Pre-embed fonts (one per unique font family used)
    const fontCache = {};
    for (const el of elements) {
      if (el.visible && !needsCanvasFallback(el)) {
        const sf = stdFont(el.font);
        if (sf && !fontCache[el.font]) {
          fontCache[el.font] = await pdfDoc.embedFont(sf);
        }
      }
    }

    // For canvas-fallback elements, prepare offscreen canvas
    const canvasEl = needsCanvasFallbackAny(elements) ? document.createElement('canvas') : null;

    for (let i = 0; i < pages.length; i++) {
      Utils.setProgress(5 + Math.round((i / pages.length) * 88));
      const page     = pages[i];
      const { width: pdfW, height: pdfH } = page.getSize();
      const pageIdx  = i;

      for (const el of elements) {
        if (!el.visible) continue;
        const label = Utils.buildLabel(pageIdx, el, totalPages);
        if (!label) continue;

        const cleanLabel = label.replace(/[\u200E\u200F]/g, '');

        // PDF coordinate: x% of width, Y flipped (PDF origin=bottom-left)
        const { px, py } = Renderer.computePdfPos(el, pdfW, pdfH);

        // Rotation fix: PDF rotates counter-clockwise, UI is clockwise
        const pdfRot = (360 - el.rotation) % 360;

        if (needsCanvasFallback(el)) {
          // Stamp as PNG image
          await stampViaCanvas(pdfDoc, page, el, label, pdfW, pdfH, px, py, pdfRot, canvasEl);
        } else {
          const font = fontCache[el.font] || fontCache['Helvetica'];
          if (!font) continue;
          const col  = Utils.hexToRgb01(el.textColor);
          try {
            const tw = font.widthOfTextAtSize(cleanLabel, el.size);
            page.drawText(cleanLabel, {
              x:       px - tw / 2,
              y:       py - el.size * 0.35,
              size:    el.size,
              font,
              color:   rgb(col.r, col.g, col.b),
              opacity: el.opacity,
              rotate:  degrees(pdfRot),
            });
          } catch(e) {
            console.warn('pdf-lib drawText error, falling back to canvas stamp:', e);
            await stampViaCanvas(pdfDoc, page, el, label, pdfW, pdfH, px, py, pdfRot, canvasEl);
          }
        }
      }
    }

    Utils.setProgress(96);
    const out = await pdfDoc.save();
    Utils.setProgress(100);
    downloadBytes(out, buildName(fileName));
    Utils.hideLoader();
    Utils.toast('✅ PDF exported successfully!');
  }

  function needsCanvasFallbackAny(elements) {
    return elements.some(el => el.visible && needsCanvasFallback(el));
  }

  // ── Canvas stamp helper ───────────────────
  // Renders label to a canvas at 3x scale, embeds as PNG image in PDF
  async function stampViaCanvas(pdfDoc, page, el, label, pdfW, pdfH, pdfX, pdfY, pdfRot, canvas) {
    if (!canvas) canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const exportScale = 3; // 3x for crisp text
    const fontSize    = el.size * exportScale * 1.3333;
    const fontFace    = _canvasFontMap[el.font] || "'Cairo', sans-serif";
    const fontWeight  = el.weight || '400';

    ctx.font = `${fontWeight} ${fontSize}px ${fontFace}`;
    const tw = ctx.measureText(label.replace(/[\u200E\u200F]/g, '')).width;
    const th = fontSize * 1.4;

    canvas.width  = Math.ceil(tw + fontSize * 0.6);
    canvas.height = Math.ceil(th + fontSize * 0.4);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font      = `${fontWeight} ${fontSize}px ${fontFace}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = el.direction === 'rtl' ? 'rtl' : 'ltr';

    const rgb255  = Utils.hexToRgb255(el.textColor);
    ctx.globalAlpha = el.opacity;
    ctx.fillStyle   = `rgb(${rgb255.r},${rgb255.g},${rgb255.b})`;
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);

    const blob     = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const imgBytes = await blob.arrayBuffer();
    const img      = await pdfDoc.embedPng(imgBytes);

    // Size in PDF points (canvas px → PDF pts = / exportScale)
    const imgW = canvas.width  / exportScale;
    const imgH = canvas.height / exportScale;

    // The { PDFLib.degrees } rotation rotates around (x, y)
    // We need to center the image on pdfX, pdfY
    page.drawImage(img, {
      x:       pdfX - imgW / 2,
      y:       pdfY - imgH / 2,
      width:   imgW,
      height:  imgH,
      opacity: el.opacity,
      rotate:  PDFLib.degrees(pdfRot),
    });
  }

  // ── SAFE MODE EXPORT (full rasterization) ─
  async function exportSafe(pdfDoc_js, elements, totalPages, fileName) {
    const { PDFDocument } = PDFLib;
    Utils.showLoader('Rasterizing pages…', 2);

    const outPdf     = await PDFDocument.create();
    const tempCanvas = document.createElement('canvas');
    const ctx        = tempCanvas.getContext('2d');
    const SCALE      = 2.5; // high DPI rasterization

    for (let i = 1; i <= totalPages; i++) {
      Utils.loaderText(`Rasterizing page ${i} / ${totalPages}…`);
      Utils.setProgress(2 + Math.round((i / totalPages) * 92));

      const page  = await pdfDoc_js.getPage(i);
      const vp    = page.getViewport({ scale: SCALE });
      tempCanvas.width  = vp.width;
      tempCanvas.height = vp.height;
      ctx.clearRect(0, 0, vp.width, vp.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, vp.width, vp.height);

      // Render PDF page
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      // Draw numbering elements using SAME drawElementOnCanvas function
      const pageIdx = i - 1;
      elements.forEach(el => {
        if (!el.visible) return;
        const label = Utils.buildLabel(pageIdx, el, totalPages);
        if (!label) return;
        Renderer.drawElementOnCanvas(ctx, el, label, vp.width, vp.height, SCALE);
      });

      // Embed as JPEG
      const blob     = await new Promise(res => tempCanvas.toBlob(res, 'image/jpeg', 0.93));
      const imgBytes = await blob.arrayBuffer();
      const img      = await outPdf.embedJpg(imgBytes);

      // PDF page at original size
      const vp1  = page.getViewport({ scale: 1 });
      const np   = outPdf.addPage([vp1.width, vp1.height]);
      np.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    }

    Utils.setProgress(98);
    const bytes = await outPdf.save();
    Utils.setProgress(100);
    downloadBytes(bytes, buildName(fileName));
    Utils.hideLoader();
    Utils.toast('✅ Safe mode export done!');
  }

  return { exportDirect, exportSafe };
})();
