const { PDFDocument, rgb, degrees } = PDFLib;

let state = {
    pdfDoc: null,
    pdfBytes: null,
    totalOriginalPages: 0,
    currentPage: 1,
    zoom: 1.0,
    elements: [],
    activeElementId: null,
    isDragging: false
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    addElement(); // Start with one default element
});

function initEvents() {
    document.getElementById('pdf-upload').addEventListener('change', handleUpload);
    document.getElementById('add-element').addEventListener('click', addElement);
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));
    document.getElementById('export-btn').addEventListener('click', exportPDF);
    
    // Bind all inputs to update the state and preview
    const inputs = ['format', 'start-num', 'padding', 'apply-to', 'start-page', 'font-size', 'font-color', 'opacity', 'pos-x', 'pos-y', 'rotation'];
    inputs.forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            updateActiveElement(id.replace(/-([a-z])/g, g => g[1].toUpperCase()), e.target.value);
        });
    });

    document.getElementById('repeat-count').addEventListener('change', renderPreview);
}

// --- PDF Loading ---
async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    state.pdfBytes = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: state.pdfBytes });
    state.pdfDoc = await loadingTask.promise;
    state.totalOriginalPages = state.pdfDoc.numPages;

    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('total-pages-num').innerText = state.totalOriginalPages;
    
    if (state.totalOriginalPages === 1) {
        document.getElementById('repeat-container').classList.remove('hidden');
    } else {
        document.getElementById('repeat-container').classList.add('hidden');
    }

    renderPreview();
}

// --- Element Management ---
function addElement() {
    const id = Date.now();
    const newElement = {
        id,
        format: 'Page {n}',
        startNum: 1,
        padding: 1,
        applyTo: 'all',
        startPage: 1,
        fontSize: 24,
        color: '#ff0000',
        opacity: 100,
        posX: 50,
        posY: 90,
        rotation: 0
    };
    state.elements.push(newElement);
    setActiveElement(id);
    updateElementList();
}

function updateElementList() {
    const list = document.getElementById('element-list');
    list.innerHTML = '';
    state.elements.forEach((el, index) => {
        const div = document.createElement('div');
        div.className = `control-row item ${el.id === state.activeElementId ? 'active' : ''}`;
        div.style = "background: #334155; padding: 10px; margin-bottom: 5px; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between;";
        div.innerHTML = `
            <span>Element ${index + 1}</span>
            <button onclick="deleteElement(${el.id}, event)" style="background:none; border:none; color:#f87171; cursor:pointer;">✕</button>
        `;
        div.onclick = () => setActiveElement(el.id);
        list.appendChild(div);
    });
}

function setActiveElement(id) {
    state.activeElementId = id;
    const el = state.elements.find(e => e.id === id);
    if (!el) return;

    document.getElementById('element-settings').classList.remove('disabled');
    
    // Sync UI
    document.getElementById('format').value = el.format;
    document.getElementById('start-num').value = el.startNum;
    document.getElementById('padding').value = el.padding;
    document.getElementById('apply-to').value = el.applyTo;
    document.getElementById('start-page').value = el.startPage;
    document.getElementById('font-size').value = el.fontSize;
    document.getElementById('font-color').value = el.color;
    document.getElementById('opacity').value = el.opacity;
    document.getElementById('pos-x').value = el.posX;
    document.getElementById('pos-y').value = el.posY;
    document.getElementById('rotation').value = el.rotation;

    updateElementList();
    renderPreview();
}

function updateActiveElement(key, value) {
    const el = state.elements.find(e => e.id === state.activeElementId);
    if (el) {
        el[key] = value;
        renderPreview();
    }
}

function deleteElement(id, e) {
    e.stopPropagation();
    state.elements = state.elements.filter(el => el.id !== id);
    if (state.activeElementId === id) state.activeElementId = state.elements[0]?.id || null;
    updateElementList();
    renderPreview();
}

// --- Preview Engine ---
async function renderPreview() {
    if (!state.pdfDoc) return;

    const pageNum = state.currentPage;
    const page = await state.pdfDoc.getPage(pageNum);
    
    const viewport = page.getViewport({ scale: 2.0 * state.zoom }); // High res render
    const canvas = document.getElementById('pdf-canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport: viewport }).promise;

    // Render Overlays (The numbers)
    const overlay = document.getElementById('overlay-container');
    overlay.innerHTML = '';

    state.elements.forEach(el => {
        const placement = NumXEngine.calculatePlacement(el, pageNum - 1, canvas.width, canvas.height, false);
        if (!placement) return;

        const div = document.createElement('div');
        div.className = `draggable-number ${el.id === state.activeElementId ? 'active' : ''}`;
        div.innerText = placement.text;
        div.style.left = `${placement.x}px`;
        div.style.top = `${placement.y}px`;
        div.style.fontSize = `${placement.fontSize * 2 * state.zoom}px`; // Match 2x scale
        div.style.color = placement.color;
        div.style.opacity = placement.opacity;
        div.style.transform = `translate(-50%, -50%) rotate(${placement.rotate}deg)`;
        
        // Drag logic
        div.onmousedown = (e) => startDrag(e, el);
        
        overlay.appendChild(div);
    });
}

function startDrag(e, element) {
    setActiveElement(element.id);
    const rect = document.getElementById('pdf-canvas').getBoundingClientRect();
    
    const move = (moveEvt) => {
        const x = ((moveEvt.clientX - rect.left) / rect.width) * 100;
        const y = ((moveEvt.clientY - rect.top) / rect.height) * 100;
        
        updateActiveElement('posX', Math.max(0, Math.min(100, x.toFixed(1))));
        updateActiveElement('posY', Math.max(0, Math.min(100, y.toFixed(1))));
        
        document.getElementById('pos-x').value = element.posX;
        document.getElementById('pos-y').value = element.posY;
    };
    
    const stop = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', stop);
    };
    
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
}

function changePage(delta) {
    const newPage = state.currentPage + delta;
    if (newPage >= 1 && newPage <= state.totalOriginalPages) {
        state.currentPage = newPage;
        document.getElementById('current-page-num').innerText = newPage;
        renderPreview();
    }
}

// --- Export Engine ---
async function exportPDF() {
    if (!state.pdfBytes) return;

    // 1. Load document
    const mainPdf = await PDFDocument.load(state.pdfBytes);
    const exportPdf = await PDFDocument.create();
    exportPdf.registerFontkit(fontkit);

    // 2. Handle Repeating Page feature
    const repeatCount = parseInt(document.getElementById('repeat-count').value) || 1;
    let pagesToProcess = [];

    if (state.totalOriginalPages === 1 && repeatCount > 1) {
        const [templatePage] = await exportPdf.copyPages(mainPdf, [0]);
        for (let i = 0; i < repeatCount; i++) {
            const newPage = exportPdf.addPage([templatePage.getWidth(), templatePage.getHeight()]);
            // This is a simplified way to "clone" page content manually or re-copy
            const [temp] = await exportPdf.copyPages(mainPdf, [0]);
            exportPdf.insertPage(i, temp);
        }
        exportPdf.removePage(repeatCount); // remove the initial addPage
    } else {
        const copiedPages = await exportPdf.copyPages(mainPdf, mainPdf.getPageIndices());
        copiedPages.forEach(p => exportPdf.addPage(p));
    }

    const pages = exportPdf.getPages();

    // 3. Apply Numbers using SHARED Engine
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();

        state.elements.forEach(el => {
            const props = NumXEngine.calculatePlacement(el, i, width, height, true);
            if (!props) return;

            const rgbColor = NumXEngine.hexToRgb(props.color);

            page.drawText(props.text, {
                x: props.x,
                y: props.y,
                size: props.fontSize,
                color: rgb(rgbColor.r, rgbColor.g, rgbColor.b),
                opacity: props.opacity,
                rotate: degrees(props.rotate),
            });
        });
    }

    // 4. Download
    const pdfBytes = await exportPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `NumX_Numbered.pdf`;
    link.click();
}