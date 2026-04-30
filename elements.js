// ═══════════════════════════════════════════
//  NumX — Elements Manager
//  Manages multiple independent numbering elements
// ═══════════════════════════════════════════
'use strict';

const Elements = (() => {
  const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#ec4899','#06b6d4'];

  let _elements = [];
  let _activeId = null;
  let _nextId   = 1;
  let _onChange  = null; // callback

  function setChangeCallback(fn) { _onChange = fn; }
  function notify() { if (_onChange) _onChange(); }

  // ── Default element config ───────────────
  function defaults() {
    return {
      id:           _nextId++,
      visible:      true,
      color:        COLORS[(_nextId - 2) % COLORS.length],
      // Content
      format:       'Page {n}',
      customFormat: '{n}',
      startNum:     1,
      increment:    1,
      padding:      0,
      numerals:     'latin',
      // Page rules
      fromPage:     1,
      toPage:       0,
      applyTo:      'all',
      skipPattern:  'none',
      // Style
      font:         'Cairo',
      size:         12,
      weight:       '400',
      textColor:    '#000000',
      opacity:      1.0,
      direction:    'ltr',
      // Position
      x:            50,   // percent of page width
      y:            92,   // percent of page height
      // Rotation
      rotation:     0,
    };
  }

  // ── CRUD ─────────────────────────────────
  function add() {
    const el = defaults();
    _elements.push(el);
    _activeId = el.id;
    notify();
    return el;
  }

  function remove(id) {
    _elements = _elements.filter(e => e.id !== id);
    if (_activeId === id) {
      _activeId = _elements.length ? _elements[_elements.length - 1].id : null;
    }
    notify();
  }

  function setActive(id) {
    _activeId = id;
    notify();
  }

  function getActive() {
    return _elements.find(e => e.id === _activeId) || null;
  }

  function getAll() { return _elements; }

  function updateActive(patch) {
    const el = getActive();
    if (!el) return;
    Object.assign(el, patch);
    notify();
  }

  function getById(id) { return _elements.find(e => e.id === id); }

  // ── Sidebar UI rendering ─────────────────
  function renderList() {
    const list = document.getElementById('element-list');
    list.innerHTML = '';

    _elements.forEach(el => {
      const item = document.createElement('div');
      item.className = 'elem-item' + (el.id === _activeId ? ' active' : '');
      item.dataset.id = el.id;
      item.innerHTML = `
        <div class="elem-dot" style="background:${el.color}"></div>
        <div class="elem-label">${labelFor(el)}</div>
        <div class="elem-vis" title="Toggle visibility">
          ${el.visible
            ? `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="8" cy="8" rx="5" ry="3.5"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>`
            : `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 2l12 12M6.5 5.5A5 5 0 0113 8c-.6 1-1.5 1.8-2.5 2.3"/><path d="M4.5 6.5A5 5 0 003 8c1 2 3 3.5 5 3.5a5 5 0 002-.4"/></svg>`
          }
        </div>
        <div class="elem-del" title="Delete">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </div>
      `;

      // Select
      item.addEventListener('click', () => {
        setActive(el.id);
        renderList();
        syncSidebarToActive();
      });

      // Visibility toggle
      item.querySelector('.elem-vis').addEventListener('click', e => {
        e.stopPropagation();
        el.visible = !el.visible;
        notify();
        renderList();
      });

      // Delete
      item.querySelector('.elem-del').addEventListener('click', e => {
        e.stopPropagation();
        if (_elements.length <= 1) {
          Utils.toast('At least one element required');
          return;
        }
        remove(el.id);
        renderList();
        syncSidebarToActive();
      });

      list.appendChild(item);
    });

    // Show/hide settings panel
    const settingsPanel = document.getElementById('element-settings');
    settingsPanel.style.display = _activeId ? 'block' : 'none';
  }

  function labelFor(el) {
    const fmt = el.format === 'custom' ? el.customFormat : el.format;
    return fmt.replace('{n}','#').replace('{total}','N');
  }

  // ── Sync sidebar controls → active element ──
  function syncSidebarToActive() {
    const el = getActive();
    if (!el) return;

    _syncing = true;

    // Content
    _set('s-format', el.format === 'custom' ? 'custom' : el.format);
    document.getElementById('custom-format-wrap').style.display =
      el.format === 'custom' ? 'block' : 'none';
    _set('s-custom-format', el.customFormat);
    _set('s-start-num', el.startNum);
    _set('s-increment', el.increment);
    _set('s-padding', el.padding);
    _set('s-numerals', el.numerals);

    // Page rules
    _set('s-from-page', el.fromPage);
    _set('s-to-page', el.toPage);
    _setSegCtrl('apply', el.applyTo);
    _setSegCtrl('skip', el.skipPattern || 'none');

    // Style
    _set('s-font', el.font);
    _set('s-size', el.size);
    _set('s-weight', el.weight);
    _set('s-color', el.textColor);
    _set('s-color-hex', el.textColor);
    _set('s-opacity', Math.round(el.opacity * 100));
    document.getElementById('opacity-val').textContent = Math.round(el.opacity * 100) + '%';
    _setSegCtrl('direction', el.direction);

    // Position
    _set('s-x', el.x);
    _set('s-y', el.y);
    document.getElementById('x-val').textContent = el.x.toFixed(1) + '%';
    document.getElementById('y-val').textContent = el.y.toFixed(1) + '%';
    document.getElementById('coord-x').textContent = el.x.toFixed(1) + '%';
    document.getElementById('coord-y').textContent = el.y.toFixed(1) + '%';

    // Rotation
    _set('s-rotation', el.rotation);
    document.getElementById('rot-val').textContent = el.rotation + '°';
    _setSegCtrl('rot-preset', [0, 90, 180, 270].includes(el.rotation) ? String(el.rotation) : '');

    _syncing = false;
  }

  let _syncing = false;

  function _set(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  function _setSegCtrl(key, val) {
    document.querySelectorAll(`.seg-ctrl[data-key="${key}"] .seg`).forEach(s => {
      s.classList.toggle('active', s.dataset.val === String(val));
    });
  }

  // ── Wire sidebar controls → updateActive ──
  function wireSidebar() {
    const bind = (id, prop, transform) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        if (_syncing) return;
        const val = transform ? transform(el.value) : el.value;
        updateActive({ [prop]: val });
        if (prop === 'x' || prop === 'y') {
          document.getElementById('x-val').textContent =
            parseFloat(document.getElementById('s-x').value).toFixed(1) + '%';
          document.getElementById('y-val').textContent =
            parseFloat(document.getElementById('s-y').value).toFixed(1) + '%';
          document.getElementById('coord-x').textContent =
            parseFloat(document.getElementById('s-x').value).toFixed(1) + '%';
          document.getElementById('coord-y').textContent =
            parseFloat(document.getElementById('s-y').value).toFixed(1) + '%';
          document.getElementById('s-pos-preset').value = 'custom';
        }
        renderList();
      });
      el.addEventListener('change', () => {
        if (_syncing) return;
        const val = transform ? transform(el.value) : el.value;
        updateActive({ [prop]: val });
        renderList();
      });
    };

    // Content
    bind('s-format', 'format');
    document.getElementById('s-format').addEventListener('change', () => {
      if (_syncing) return;
      const v = document.getElementById('s-format').value;
      document.getElementById('custom-format-wrap').style.display = v === 'custom' ? 'block' : 'none';
    });
    bind('s-custom-format', 'customFormat');
    bind('s-start-num',  'startNum',  v => parseInt(v)||1);
    bind('s-increment',  'increment', v => parseInt(v)||1);
    bind('s-padding',    'padding',   v => parseInt(v)||0);
    bind('s-numerals',   'numerals');

    // Page rules
    bind('s-from-page', 'fromPage', v => parseInt(v)||1);
    bind('s-to-page',   'toPage',   v => parseInt(v)||0);

    // Style
    bind('s-font',    'font');
    bind('s-size',    'size',    v => parseFloat(v)||12);
    bind('s-weight',  'weight');
    bind('s-opacity', 'opacity', v => {
      const pct = parseInt(v);
      document.getElementById('opacity-val').textContent = pct + '%';
      return pct / 100;
    });

    // Color sync
    document.getElementById('s-color').addEventListener('input', e => {
      if (_syncing) return;
      document.getElementById('s-color-hex').value = e.target.value;
      updateActive({ textColor: e.target.value });
      renderList();
    });
    document.getElementById('s-color-hex').addEventListener('input', e => {
      if (_syncing) return;
      const hex = e.target.value;
      if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
        document.getElementById('s-color').value = hex;
        updateActive({ textColor: hex });
        renderList();
      }
    });

    // Position sliders
    bind('s-x', 'x', v => parseFloat(v));
    bind('s-y', 'y', v => parseFloat(v));

    // Rotation slider
    document.getElementById('s-rotation').addEventListener('input', e => {
      if (_syncing) return;
      const v = parseInt(e.target.value);
      document.getElementById('rot-val').textContent = v + '°';
      // Clear preset selection
      document.querySelectorAll('.seg-ctrl[data-key="rot-preset"] .seg').forEach(s => {
        s.classList.toggle('active', s.dataset.val === String(v));
      });
      updateActive({ rotation: v });
    });

    // Segmented controls
    document.querySelectorAll('.seg-ctrl').forEach(ctrl => {
      const key = ctrl.dataset.key;
      ctrl.querySelectorAll('.seg').forEach(seg => {
        seg.addEventListener('click', () => {
          if (_syncing) return;
          ctrl.querySelectorAll('.seg').forEach(s => s.classList.remove('active'));
          seg.classList.add('active');
          const val = seg.dataset.val;
          // Map key → element property
          const keyMap = {
            apply:        'applyTo',
            skip:         'skipPattern',
            direction:    'direction',
            'rot-preset': 'rotation',
          };
          if (keyMap[key]) {
            const prop  = keyMap[key];
            const parsed = prop === 'rotation' ? parseInt(val) : val;
            updateActive({ [prop]: parsed });
            if (prop === 'rotation') {
              document.getElementById('s-rotation').value = val;
              document.getElementById('rot-val').textContent = val + '°';
            }
            renderList();
          }
        });
      });
    });

    // Position preset
    document.getElementById('s-pos-preset').addEventListener('change', e => {
      if (_syncing) return;
      const presets = {
        'bottom-center': [50, 92],
        'bottom-left':   [5,  92],
        'bottom-right':  [95, 92],
        'top-center':    [50, 6],
        'top-left':      [5,  6],
        'top-right':     [95, 6],
        'middle-left':   [5,  50],
        'middle-right':  [95, 50],
      };
      const v = e.target.value;
      if (presets[v]) {
        const [x, y] = presets[v];
        updateActive({ x, y });
        document.getElementById('s-x').value = x;
        document.getElementById('s-y').value = y;
        document.getElementById('x-val').textContent = x.toFixed(1) + '%';
        document.getElementById('y-val').textContent = y.toFixed(1) + '%';
        document.getElementById('coord-x').textContent = x.toFixed(1) + '%';
        document.getElementById('coord-y').textContent = y.toFixed(1) + '%';
      }
    });

    // Collapsible panels
    document.querySelectorAll('.panel-header.collapsible').forEach(header => {
      header.addEventListener('click', () => {
        const body = document.getElementById(header.dataset.target);
        if (!body) return;
        const collapsed = body.classList.toggle('hidden');
        header.closest('.panel').classList.toggle('collapsed', collapsed);
      });
    });

    // Add element button
    document.getElementById('btn-add-element').addEventListener('click', () => {
      add();
      renderList();
      syncSidebarToActive();
    });
  }

  return {
    add, remove, setActive, getActive, getAll, getById,
    updateActive, renderList, syncSidebarToActive, wireSidebar,
    setChangeCallback,
  };
})();
