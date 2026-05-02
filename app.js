// ---------- STATE ----------
let appState = {
    pdfDoc: null,               // pdf.js document object
    pdfBytes: null,             // original file bytes
    totalOriginalPages: 0,
    currentPage: 1,
    zoom: 1.0,
    elements: [],               // array of element objects
    activeElementId: null
};

// ---------- DOM Elements ----------
const pdfUpload = document.getElementById('pdfUpload');
const uploadTrigger = document.getElementById('uploadTrigger');
const repeatBlock = document.getElementById('repeatBlock');
const repeatCountInput = document.getElementById('repeatCount');
const addElementBtn = document.getElementById('addElementBtn');
const elementsListDiv = document.getElementById('elementsList');
const settingsPanel = document.getElementById('settingsPanel');
const prevBtn = document.getElementById('prevPageBtn');
const nextBtn = document.getElementById('nextPageBtn');
const currentPageSpan = document.getElementById('currentPageNum');
const totalPagesSpan = document.getElementById('totalPagesNum');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomPercentSpan = document.getElementById('zoomPercent');
const exportBtn = document.getElementById('exportBtn');
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const overlayContainer = document.getElementById('overlayContainer');
const canvasContainer = document.getElementById('canvasContainer');
const emptyState = document.getElementById('emptyState');

// Settings inputs
const formatInput = document.getElementById('formatInput');
const startNumInput = document.getElementById('startNum');
const paddingSelect = document.getElementById('paddingSelect');
const applyToSelect = document.getElementById('applyToSelect');
const startPageInput = document.getElementById('startPage');
const fontSizeInput = document.getElementById('fontSize');
const fontColorInput = document.getElementById('fontColor');
const opacitySlider = document.getElementById('opacitySlider');
const posXInput = document.getElementById('posX');
const posYInput = document.getElementById('posY');
const rotationSlider = document.getElementById('rotationSlider');

// ---------- Helper: sync UI from active element ----------
function syncUIFromActiveElement() {
    const el = appState.elements.find(e => e.id === appState.activeElementId);
    if (!el) {
        settingsPanel.classList.add('disabled');
        return;
    }
    settingsPanel.classList.remove('disabled');
    formatInput.value = el.format;
    startNumInput.value = el.startNum;
    paddingSelect.value = el.padding;
    applyToSelect.value = el.applyTo;
    startPageInput.value = el.startPage;
    fontSizeInput.value = el.fontSize;
    fontColorInput.value = el.color;
    opacitySlider.value = el.opacity;
    posXInput.value = el.posX;
    posYInput.value = el.posY;
    rotationSlider.value = el.rotation;
}

// Update active element property and re-render
function updateActiveElementProperty(key, value) {
    if (!appState.activeElementId) return;
    const el = appState.elements.find(e => e.id === appState.activeElementId);
    if (el) {
        el[key] = value;
        renderPreview();
    }
}

// Bind settings events (called once)
function bindSettingsEvents() {
    formatInput.addEventListener('input', (e) => updateActiveElementProperty('format', e.target.value));
    startNumInput.addEventListener('input', (e) => updateActiveElementProperty('startNum', parseInt(e.target.value) || 1));
    paddingSelect.addEventListener('change', (e) => updateActiveElementProperty('padding', e.target.value));
    applyToSelect.addEventListener('change', (e) => updateActiveElementProperty('applyTo', e.target.value));
    startPageInput.addEventListener('input', (e) => updateActiveElementProperty('startPage', parseInt(e.target.value) || 1));
    fontSizeInput.addEventListener('input', (e) => updateActiveElementProperty('fontSize', parseFloat(e.target.value) || 10));
    fontColorInput.addEventListener('input', (e) => updateActiveElementProperty('color', e.target.value));
    opacitySlider.addEventListener('input', (e) => updateActiveElementProperty('opacity', parseInt(e.target.value)));
    posXInput.addEventListener('input', (e) => updateActiveElementProperty('posX', parseFloat(e.target.value) || 0));
    posYInput.addEventListener('input', (e) => updateActiveElementProperty('posY', parseFloat(e.target.value) || 0));
    rotationSlider.addEventListener('input', (e) => updateActiveElementProperty('rotation', parseInt(e.target.value)));
}

// ---------- Elements UI ----------
function renderElementsList() {
    elementsListDiv.innerHTML = '';
    appState.elements.forEach((el, idx) => {
        const div = document.createElement('div');
        div.className = `element-item ${appState.activeElementId === el.id ? 'active' : ''}`;
        div.innerHTML = `
            <span class="element-name">${el.format.replace(/\{n\}/g, '...')}</span>
            <button class="delete-element" data-id="${el.id}"><i class="fas fa-trash-alt"></i></button>
        `;
        div.addEventListener('click', (e) => {
            if (e.target.closest('.delete-element')) return;
            setActiveElement(el.id);
        });
        const delBtn = div.querySelector('.delete-element');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteElement(el.id);
        });
        elementsListDiv.appendChild(div);
    });
}

function setActiveElement(id) {
    appState.activeElementId = id;
    renderElementsList();
    syncUIFromActiveElement();
    renderPreview();
}

function deleteElement(id) {
    appState.elements = appState.elements.filter(el => el.id !== id);
    if (appState.activeElementId === id) {
        appState.activeElementId = appState.elements.length > 0 ? appState.elements[0].id : null;
    }
    renderElementsList();
    if (appState.activeElementId) syncUIFromActiveElement();
    else settingsPanel.classList.add('disabled');
    renderPreview();
}

function addElement() {
    const newId = Date.now();
    const newElem = {
        id: newId,
        format: '{n}',
        startNum: 1,
        padding: '1',
        applyTo: 'all',
        startPage: 1,
        fontSize: 14,
        color: '#ffffff',
        opacity: 100,
        posX: 50,
        posY: 90,
        rotation: 0
    };
    appState.elements.push(newElem);
    setActiveElement(newId);
}

// ---------- PDF Upload & Loading ----------
async function handleUpload(file) {
    if (!file) return;
    emptyState.style.display = 'none';
    canvasContainer.style.display = 'block';
    
    const arrayBuffer = await file.arrayBuffer();
    appState.pdfBytes = arrayBuffer;
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    appState.pdfDoc = await loadingTask.promise;
    appState.totalOriginalPages = appState.pdfDoc.numPages;
    totalPagesSpan.innerText = appState.totalOriginalPages;
    
    // Show repeat block only if single page
    if (appState.totalOriginalPages === 1) {
        repeatBlock.style.display = 'block';
    } else {
        repeatBlock.style.display = 'none';
    }
    
    appState.currentPage = 1;
    currentPageSpan.innerText = 1;
    await renderPreview();
}

// ---------- Preview Rendering (with dynamic overlay) ----------
async function renderPreview() {
    if (!appState.pdfDoc) return;
    const pageNum = appState.currentPage;
    const page = await appState.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: appState.zoom });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvasContainer.style.width = `${viewport.width}px`;
    canvasContainer.style.height = `${viewport.height}px`;
    
    await page.render({ canvasContext: ctx, viewport }).promise;
    
    // Clear and redraw overlays
    overlayContainer.innerHTML = '';
    for (const el of appState.elements) {
        const placement = NumXEngine.calculatePlacement(el, pageNum-1, canvas.width, canvas.height, false);
        if (!placement) continue;
        
        const div = document.createElement('div');
        div.className = `overlay-number ${el.id === appState.activeElementId ? 'active' : ''}`;
        div.innerText = placement.text;
        div.style.left = `${placement.x}px`;
        div.style.top = `${placement.y}px`;
        div.style.fontSize = `${placement.fontSize * appState.zoom}px`;
        div.style.color = placement.color;
        div.style.opacity = placement.opacity;
        div.style.transform = `translate(-50%, -50%) rotate(${placement.originalRotation}deg)`;
        div.style.fontWeight = '500';
        div.style.textShadow = '0 1px 2px rgba(0,0,0,0.2)';
        
        // Drag to reposition
        div.addEventListener('mousedown', (e) => startDragElement(e, el));
        overlayContainer.appendChild(div);
    }
}

// Drag handler
let dragActive = false;
function startDragElement(e, element) {
    e.preventDefault();
    setActiveElement(element.id);
    const canvasRect = canvas.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = element.posX;
    const startPosY = element.posY;
    
    function onMouseMove(moveEv) {
        const dx = moveEv.clientX - startX;
        const dy = moveEv.clientY - startY;
        let deltaX = (dx / canvasRect.width) * 100;
        let deltaY = (dy / canvasRect.height) * 100;
        let newX = startPosX + deltaX;
        let newY = startPosY + deltaY;
        newX = Math.min(100, Math.max(0, newX));
        newY = Math.min(100, Math.max(0, newY));
        updateActiveElementProperty('posX', newX);
        updateActiveElementProperty('posY', newY);
        posXInput.value = newX;
        posYInput.value = newY;
    }
    function onMouseUp() {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

// Navigation
function changePage(delta) {
    let newPage = appState.currentPage + delta;
    if (newPage >= 1 && newPage <= appState.totalOriginalPages) {
        appState.currentPage = newPage;
        currentPageSpan.innerText = newPage;
        renderPreview();
    }
}

// Zoom
function zoom(delta) {
    let newZoom = appState.zoom + delta;
    newZoom = Math.min(3, Math.max(0.5, newZoom));
    appState.zoom = newZoom;
    zoomPercentSpan.innerText = `${Math.round(newZoom*100)}%`;
    renderPreview();
}

// ---------- EXPORT FUNCTION (FULLY WORKING) ----------
async function exportPDF() {
    if (!appState.pdfBytes) {
        alert('يرجى رفع ملف PDF أولاً');
        return;
    }
    
    const repeatCount = parseInt(repeatCountInput.value) || 1;
    const isSinglePageRepeat = (appState.totalOriginalPages === 1 && repeatCount > 1);
    
    // Load the original PDF
    const originalPdf = await PDFLib.PDFDocument.load(appState.pdfBytes);
    const newPdf = await PDFLib.PDFDocument.create();
    newPdf.registerFontkit(fontkit);
    
    // Determine how many pages in final document
    let finalPageCount = 0;
    if (isSinglePageRepeat) {
        finalPageCount = repeatCount;
    } else {
        finalPageCount = appState.totalOriginalPages;
    }
    
    // Copy pages accordingly
    if (isSinglePageRepeat) {
        const [templatePage] = await newPdf.copyPages(originalPdf, [0]);
        for (let i = 0; i < repeatCount; i++) {
            const [copied] = await newPdf.copyPages(originalPdf, [0]);
            newPdf.addPage(copied);
        }
    } else {
        const indices = originalPdf.getPageIndices();
        const pages = await newPdf.copyPages(originalPdf, indices);
        pages.forEach(page => newPdf.addPage(page));
    }
    
    const pages = newPdf.getPages();
    // Apply numbering to each page
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();
        for (const el of appState.elements) {
            const placement = NumXEngine.calculatePlacement(el, i, width, height, true, pages.length);
            if (!placement) continue;
            const rgb = NumXEngine.hexToRgb(placement.color);
            page.drawText(placement.text, {
                x: placement.x,
                y: placement.y,
                size: placement.fontSize,
                color: PDFLib.rgb(rgb.r, rgb.g, rgb.b),
                opacity: placement.opacity,
                rotate: PDFLib.degrees(placement.rotation)
            });
        }
    }
    
    // Save and download
    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'NumX_Numbered.pdf';
    link.click();
    URL.revokeObjectURL(link.href);
}

// ---------- Event Listeners ----------
uploadTrigger.addEventListener('click', () => pdfUpload.click());
pdfUpload.addEventListener('change', (e) => handleUpload(e.target.files[0]));
addElementBtn.addEventListener('click', addElement);
prevBtn.addEventListener('click', () => changePage(-1));
nextBtn.addEventListener('click', () => changePage(1));
zoomOutBtn.addEventListener('click', () => zoom(-0.1));
zoomInBtn.addEventListener('click', () => zoom(0.1));
exportBtn.addEventListener('click', exportPDF);
repeatCountInput.addEventListener('change', () => renderPreview());

bindSettingsEvents();

// Initialize with one default element
addElement();