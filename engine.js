/**
 * NumX Engine v3 - Shared logic for preview & export
 * Handles text generation, coordinate conversion, and placement
 */
const NumXEngine = (function() {
    // Convert hex to RGB (0-1 range)
    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return { r, g, b };
    }

    // Apply padding
    function padNumber(num, padding) {
        const padLen = parseInt(padding);
        if (padLen === 1) return num.toString();
        return num.toString().padStart(padLen, '0');
    }

    // Check if element applies to this page
    function shouldApply(element, pageIndex) {
        const realPage = pageIndex + 1;
        const startPage = parseInt(element.startPage) || 1;
        if (realPage < startPage) return false;
        
        const applyTo = element.applyTo;
        if (applyTo === 'odd' && realPage % 2 === 0) return false;
        if (applyTo === 'even' && realPage % 2 !== 0) return false;
        return true;
    }

    // Generate display text with user's format
    function getDisplayText(element, pageIndex, totalPages = null) {
        const realPage = pageIndex + 1;
        const startPage = parseInt(element.startPage) || 1;
        const startNum = parseInt(element.startNum) || 1;
        const padding = element.padding || '1';
        
        let sequence = (realPage - startPage) + startNum;
        let numStr = padNumber(sequence, padding);
        let text = element.format.replace(/\{n\}/g, numStr);
        if (totalPages !== null) {
            text = text.replace(/\{total\}/g, totalPages);
        }
        // Left-to-right mark for Arabic mixed with numbers
        if (/[\u0600-\u06FF]/.test(text)) {
            text = '\u200E' + text;
        }
        return text;
    }

    /**
     * Calculate placement for either preview (DOM) or export (PDF-lib)
     * @param {Object} element - element settings
     * @param {number} pageIndex - zero-based page index
     * @param {number} pageWidth - width in points/pixels
     * @param {number} pageHeight - height in points/pixels
     * @param {boolean} isExport - if true, Y origin is bottom-left; if false, top-left
     * @param {number} totalPages - optional total pages for {total} replacement
     */
    function calculatePlacement(element, pageIndex, pageWidth, pageHeight, isExport = false, totalPages = null) {
        if (!shouldApply(element, pageIndex)) return null;
        
        const text = getDisplayText(element, pageIndex, totalPages);
        const fontSize = parseFloat(element.fontSize);
        const opacity = (element.opacity || 100) / 100;
        const color = element.color;
        
        // Position as percentage (0-100)
        let xPercent = parseFloat(element.posX) || 0;
        let yPercent = parseFloat(element.posY) || 0;
        
        let x = (xPercent / 100) * pageWidth;
        let y;
        if (isExport) {
            // PDF-lib: origin at bottom-left
            y = ((100 - yPercent) / 100) * pageHeight;
        } else {
            // DOM: origin at top-left
            y = (yPercent / 100) * pageHeight;
        }
        
        let rotation = parseFloat(element.rotation) || 0;
        let finalRotation = isExport ? (360 - rotation) % 360 : rotation;
        
        return {
            text,
            x,
            y,
            fontSize,
            color,
            opacity,
            rotation: finalRotation,
            originalRotation: rotation
        };
    }

    return {
        calculatePlacement,
        hexToRgb,
        getDisplayText,
        shouldApply
    };
})();