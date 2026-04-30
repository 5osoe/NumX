/**
 * NumX Rendering Engine
 * SHARED logic between Preview and Export
 */
const NumXEngine = {
    // Standard PDF DPI is 72. 
    // PDF-lib uses (0,0) at bottom-left. 
    // Canvas/DOM uses (0,0) at top-left.

    calculatePlacement(element, pageIdx, pageWidth, pageHeight, isExport = false) {
        // 1. Calculate Page Number Logic
        const realPageNum = pageIdx + 1;
        const startPage = parseInt(element.startPage) || 1;
        
        // Rules Check
        if (realPageNum < startPage) return null;
        if (element.applyTo === 'odd' && realPageNum % 2 === 0) return null;
        if (element.applyTo === 'even' && realPageNum % 2 !== 0) return null;

        // 2. Generate Text Content
        const sequenceNum = (realPageNum - startPage) + parseInt(element.startNum);
        let numStr = sequenceNum.toString().padStart(parseInt(element.padding), '0');
        
        // Arabic Shaping (Left-to-Right mark to prevent reversal in simple PDF viewers)
        const isArabic = /[\u0600-\u06FF]/.test(element.format);
        let content = element.format.replace('{n}', numStr);
        if (isArabic) content = `\u200E${content}`;

        // 3. Position (Input is % of page)
        // In Export (PDF-lib): Y starts from bottom
        // In Preview (DOM): Y starts from top
        const x = (element.posX / 100) * pageWidth;
        let y;
        if (isExport) {
            y = ( (100 - element.posY) / 100) * pageHeight;
        } else {
            y = (element.posY / 100) * pageHeight;
        }

        // 4. Rotation Logic
        // PDF_rotation = (360 - UI_rotation) % 360 (as requested)
        const rotationDegrees = isExport ? (360 - element.rotation) % 360 : element.rotation;

        return {
            text: content,
            x: x,
            y: y,
            fontSize: parseInt(element.fontSize),
            color: element.color,
            opacity: element.opacity / 100,
            rotate: rotationDegrees
        };
    },

    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return { r, g, b };
    }
};