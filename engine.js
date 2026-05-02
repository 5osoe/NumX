/**
 * NumX Engine v2 - Shared logic for preview & export
 * Handles coordinate conversion, text generation, and placement
 */
const NumXEngine = (function() {
    // Convert hex to RGB object (0-1 range)
    function hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return { r, g, b };
    }

    // Generate formatted number string with padding
    function formatNumber(num, padding) {
        return num.toString().padStart(parseInt(padding), '0');
    }

    // Check if page should have the element based on rules
    function shouldApply(element, pageIndex, totalPages) {
        const realPage = pageIndex + 1;
        const startPage = parseInt(element.startPage) || 1;
        if (realPage < startPage) return false;
        
        const applyTo = element.applyTo;
        if (applyTo === 'odd' && realPage % 2 === 0) return false;
        if (applyTo === 'even' && realPage % 2 !== 0) return false;
        return true;
    }

    // Generate display text
    function getDisplayText(element, pageIndex) {
        const realPage = pageIndex + 1;
        const startPage = parseInt(element.startPage) || 1;
        const startNum = parseInt(element.startNum) || 1;
        const padding = element.padding || 1;
        
        let sequence = (realPage - startPage) + startNum;
        let numStr = formatNumber(sequence, padding);
        let text = element.format.replace(/\{n\}/g, numStr);
        
        // Add left-to-right mark for Arabic to keep numbers correct direction
        if (/[\u0600-\u06FF]/.test(text)) {
            text = '\u200E' + text;
        }
        return text;
    }

    // Calculate coordinates and styles for a given context (export vs preview)
    // For preview (DOM): Y from top, rotation normal
    // For export (PDF-lib): Y from bottom, rotation = (360 - rot) % 360
    function calculatePlacement(element, pageIndex, pageWidth, pageHeight, isExport = false) {
        if (!shouldApply(element, pageIndex)) return null;
        
        const text = getDisplayText(element, pageIndex);
        const fontSize = parseFloat(element.fontSize);
        const opacity = (element.opacity || 100) / 100;
        const color = element.color;
        
        // Position: X and Y are percentages (0-100)
        let xPercent = parseFloat(element.posX);
        let yPercent = parseFloat(element.posY);
        
        let x = (xPercent / 100) * pageWidth;
        let y;
        if (isExport) {
            // PDF-lib origin bottom-left
            y = ((100 - yPercent) / 100) * pageHeight;
        } else {
            // DOM origin top-left
            y = (yPercent / 100) * pageHeight;
        }
        
        // Rotation handling: preview uses normal CSS rotation, export uses PDF rotation (counter-clockwise)
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
            // For internal use
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