// The grid view: table, selection overlay, in-cell editor and pointer input.
// It only draws and reports what the user did; main.js decides what happens.
import { ROWS, COLS, colName, makeRange } from './refs.js';
import { isError } from './values.js';
import { formatValue } from './format.js';

const LONG_PRESS_MS = 500;
const TAP_SLOP = 10;
const EDGE_SCROLL = 28;
const ROW_HEAD_WIDTH = 44;
/** Column widths are drawn smaller on phones so more columns fit. */
const NARROW_QUERY = '(max-width: 480px)';
const NARROW_SCALE = 0.8;

/**
 * @typedef {import('./refs.js').Range} Range
 * @typedef {{row:number, col:number}} Pos
 * @typedef {object} GridHandlers
 * @property {(pos:Pos, extend:boolean)=>void} select       a cell was pressed
 * @property {(pos:Pos)=>void} extend                       a drag reached a cell
 * @property {(range:Range, activePos:Pos)=>void} selectRange  a header was pressed
 * @property {(pos:Pos)=>void} edit                         edit this cell in place
 * @property {(pos:Pos)=>Range|null} fillTarget             fill area for a handle dragged to pos
 * @property {(target:Range)=>void} fill                    the fill handle was released
 * @property {(col:number, width:number)=>void} resize      a column edge was released
 * @property {(x:number, y:number, pos:Pos|null)=>void} menu  context menu or long press
 * @property {()=>void} pointerStart                        any press inside the grid
 */

/** Read the cell position stored on an element, or null. */
function posOf(el) {
  const td = el?.closest?.('td[data-r]');
  return td ? { row: Number(td.dataset.r), col: Number(td.dataset.c) } : null;
}

/** Create an element with a class name. */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export class GridView {
  /**
   * @param {HTMLElement} wrap  the scrolling box
   * @param {GridHandlers} handlers
   */
  constructor(wrap, handlers) {
    this.wrap = wrap;
    this.on = handlers;
    this.inner = el('div', 'grid-inner');
    this.table = el('table', 'grid');
    this.cols = [];
    this.heads = [];
    this.rowHeads = [];
    /** @type {HTMLTableCellElement[][]} */
    this.tds = [];
    this.cache = [];
    this.selBox = el('div', 'sel-box');
    this.activeBox = el('div', 'active-box');
    this.fillBox = el('div', 'fill-box');
    this.handle = el('div', 'fill-handle');
    this.editor = el('input', 'cell-editor');
    this.editor.type = 'text';
    this.editor.autocomplete = 'off';
    this.editor.spellcheck = false;
    this.widths = [];
    this.narrow = window.matchMedia(NARROW_QUERY);
    this.narrow.addEventListener('change', () => this.setWidths(this.widths));
    this.build();
    this.bindPointer();
  }

  /** Display scale for column widths (stored widths stay unscaled). */
  get scale() {
    return this.narrow.matches ? NARROW_SCALE : 1;
  }

  // ---- building -----------------------------------------------------------

  build() {
    const colgroup = el('colgroup');
    const headCol = el('col');
    headCol.style.width = `${ROW_HEAD_WIDTH}px`;
    colgroup.append(headCol);
    const headRow = el('tr');
    headRow.append(el('th', 'corner'));
    for (let c = 0; c < COLS; c += 1) {
      const col = el('col');
      colgroup.append(col);
      this.cols.push(col);
      const th = el('th', 'colhead');
      th.dataset.c = String(c);
      th.textContent = colName(c);
      const grip = el('span', 'col-resize');
      grip.dataset.c = String(c);
      th.append(grip);
      headRow.append(th);
      this.heads.push(th);
    }
    const thead = el('thead');
    thead.append(headRow);
    const tbody = el('tbody');
    for (let r = 0; r < ROWS; r += 1) tbody.append(this.buildRow(r));
    this.table.append(colgroup, thead, tbody);
    this.handle.setAttribute('aria-hidden', 'true');
    this.editor.hidden = true;
    this.inner.append(this.table, this.selBox, this.fillBox, this.activeBox, this.handle, this.editor);
    this.wrap.append(this.inner);
  }

  buildRow(r) {
    const tr = el('tr');
    const th = el('th', 'rowhead');
    th.dataset.r = String(r);
    th.textContent = String(r + 1);
    tr.append(th);
    this.rowHeads.push(th);
    const line = [];
    for (let c = 0; c < COLS; c += 1) {
      const td = el('td');
      td.dataset.r = String(r);
      td.dataset.c = String(c);
      tr.append(td);
      line.push(td);
      this.cache.push(null);
    }
    this.tds.push(line);
    return tr;
  }

  // ---- drawing -------------------------------------------------------------

  /**
   * Redraw every cell whose text, kind or tooltip changed.
   * @param {import('./sheet.js').Sheet} sheet
   * @param {string} lang
   * @param {(code:string, row:number, col:number)=>string} errorHint
   */
  renderCells(sheet, lang, errorHint) {
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) this.renderCell(sheet, r, c, lang, errorHint);
    }
  }

  renderCell(sheet, r, c, lang, errorHint) {
    const value = sheet.getValue(r, c);
    const text = formatValue(value, sheet.getFormat(r, c), lang);
    const kind = cellKind(value);
    const title = isError(value) ? errorHint(value.code, r, c) : '';
    const key = r * COLS + c;
    const prev = this.cache[key];
    if (prev && prev.text === text && prev.kind === kind && prev.title === title) return;
    const td = this.tds[r][c];
    td.textContent = text;
    td.className = kind;
    if (title) td.title = title;
    else td.removeAttribute('title');
    this.cache[key] = { text, kind, title };
  }

  /**
   * Apply column widths to the table.
   * @param {number[]} widths
   */
  setWidths(widths) {
    this.widths = widths;
    let total = ROW_HEAD_WIDTH;
    widths.forEach((w, i) => {
      const shown = Math.round(w * this.scale);
      this.cols[i].style.width = `${shown}px`;
      total += shown;
    });
    this.table.style.width = `${total}px`;
  }

  /**
   * Move the selection overlay and header highlights.
   * @param {Range} sel
   * @param {Pos} active
   * @param {boolean} showHandle
   */
  drawSelection(sel, active, showHandle) {
    place(this.selBox, this.rectOf(sel));
    place(this.activeBox, this.rectOf(makeRange(active.row, active.col)));
    const r = this.rectOf(sel);
    this.handle.hidden = !showHandle;
    this.handle.style.transform = `translate(${r.left + r.width - 5}px, ${r.top + r.height - 5}px)`;
    this.heads.forEach((th, c) => th.classList.toggle('in-sel', c >= sel.left && c <= sel.right));
    this.rowHeads.forEach((th, i) => th.classList.toggle('in-sel', i >= sel.top && i <= sel.bottom));
    this.prevActive?.classList.remove('active-cell');
    this.prevActive = this.tds[active.row][active.col];
    this.prevActive.classList.add('active-cell');
  }

  /**
   * Show or hide the dashed outline of a fill target.
   * @param {Range|null} range
   */
  drawFill(range) {
    this.fillBox.hidden = !range;
    if (range) place(this.fillBox, this.rectOf(range));
  }

  /**
   * Pixel box of a range inside the grid content.
   * @param {Range} range
   * @returns {{left:number, top:number, width:number, height:number}}
   */
  rectOf(range) {
    const a = this.tds[range.top][range.left];
    const b = this.tds[range.bottom][range.right];
    return {
      left: a.offsetLeft,
      top: a.offsetTop,
      width: b.offsetLeft + b.offsetWidth - a.offsetLeft,
      height: b.offsetTop + b.offsetHeight - a.offsetTop,
    };
  }

  /**
   * Scroll the box so a cell is fully visible below the sticky headers.
   * @param {Pos} pos
   */
  reveal(pos) {
    const rect = this.rectOf(makeRange(pos.row, pos.col));
    const headH = this.heads[0].offsetHeight;
    const { wrap } = this;
    if (rect.top - headH < wrap.scrollTop) wrap.scrollTop = rect.top - headH;
    else if (rect.top + rect.height > wrap.scrollTop + wrap.clientHeight) {
      wrap.scrollTop = rect.top + rect.height - wrap.clientHeight;
    }
    if (rect.left - ROW_HEAD_WIDTH < wrap.scrollLeft) wrap.scrollLeft = rect.left - ROW_HEAD_WIDTH;
    else if (rect.left + rect.width > wrap.scrollLeft + wrap.clientWidth) {
      wrap.scrollLeft = rect.left + rect.width - wrap.clientWidth;
    }
  }

  /**
   * Show the in-cell editor over a cell.
   * @param {Pos} pos
   * @param {string} text
   */
  openEditor(pos, text) {
    this.reveal(pos);
    const rect = this.rectOf(makeRange(pos.row, pos.col));
    place(this.editor, { ...rect, width: Math.max(rect.width, 120) });
    this.editor.hidden = false;
    this.editor.value = text;
    this.editor.focus({ preventScroll: true });
    const end = text.length;
    this.editor.setSelectionRange(end, end);
  }

  closeEditor() {
    this.editor.hidden = true;
  }

  /**
   * Set accessible names that depend on the language.
   * @param {(key:string, params?:object)=>string} t
   */
  setLabels(t) {
    this.wrap.setAttribute('aria-label', t('gridLabel'));
    this.editor.setAttribute('aria-label', t('formulaInput'));
    this.handle.title = t('fillHandle');
    this.heads.forEach((th, c) => { th.lastChild.title = t('resizeColumn', { col: colName(c) }); });
  }

  // ---- pointer input ---------------------------------------------------------

  bindPointer() {
    this.inner.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.inner.addEventListener('click', (e) => {
      if (e.target.classList.contains('colhead')) this.pickColumn(Number(e.target.dataset.c));
      else if (e.target.classList.contains('rowhead')) this.pickRow(Number(e.target.dataset.r));
    });
    this.inner.addEventListener('dblclick', (e) => {
      const pos = posOf(e.target);
      if (pos) this.on.edit(pos);
    });
    this.inner.addEventListener('contextmenu', (e) => {
      if (e.target === this.editor) return;
      e.preventDefault();
      if (this.longPressed) return;
      this.on.menu(e.clientX, e.clientY, posOf(e.target));
    });
  }

  onPointerDown(e) {
    if (e.target === this.editor) return;
    this.on.pointerStart();
    this.longPressed = false;
    if (e.target.classList.contains('col-resize')) this.startResize(e);
    else if (e.target === this.handle) this.startFill(e);
    else {
      const pos = posOf(e.target);
      if (!pos) return;
      if (e.pointerType === 'mouse') this.mouseDown(e, pos);
      else this.touchDown(e, pos);
    }
  }

  pickColumn(c) {
    this.on.selectRange(makeRange(0, c, ROWS - 1, c), { row: 0, col: c });
  }

  pickRow(r) {
    this.on.selectRange(makeRange(r, 0, r, COLS - 1), { row: r, col: 0 });
  }

  mouseDown(e, pos) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.wrap.focus({ preventScroll: true });
    this.on.select(pos, e.shiftKey);
    this.track(e, (ev) => {
      const at = this.cellAt(ev);
      if (at) this.on.extend(at);
    });
  }

  touchDown(e, pos) {
    const start = { x: e.clientX, y: e.clientY };
    const onActive = e.target.classList.contains('active-cell');
    let moved = false;
    const timer = setTimeout(() => {
      this.longPressed = true;
      this.on.menu(start.x, start.y, pos);
    }, LONG_PRESS_MS);
    const cancel = () => clearTimeout(timer);
    this.track(e, (ev) => {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < TAP_SLOP) return;
      moved = true;
      cancel();
      const at = onActive ? this.cellAt(ev) : null;
      if (at) this.on.extend(at);
    }, () => {
      cancel();
      if (moved || this.longPressed) return;
      if (onActive) this.on.edit(pos);
      else this.on.select(pos, false);
    }, cancel);
  }

  startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const c = Number(e.target.dataset.c);
    const startX = e.clientX;
    const startW = this.cols[c].getBoundingClientRect().width || this.heads[c].offsetWidth;
    let width = startW;
    this.track(e, (ev) => {
      width = Math.max(40, Math.min(400, startW + ev.clientX - startX));
      this.cols[c].style.width = `${width}px`;
    }, () => this.on.resize(c, Math.round(width / this.scale)));
  }

  startFill(e) {
    e.preventDefault();
    let target = null;
    this.track(e, (ev) => {
      const at = this.cellAt(ev);
      if (!at) return;
      target = this.on.fillTarget(at);
      this.drawFill(target);
    }, () => {
      this.drawFill(null);
      if (target) this.on.fill(target);
    });
  }

  /**
   * Follow a pointer until it is released; scrolls near the box edges.
   * @param {PointerEvent} e
   * @param {(ev:PointerEvent)=>void} move
   * @param {(ev:PointerEvent)=>void} [up]
   * @param {()=>void} [cancel]
   */
  track(e, move, up, cancel) {
    const target = e.target;
    try { target.setPointerCapture(e.pointerId); } catch { /* element may be gone */ }
    const onMove = (ev) => {
      this.edgeScroll(ev);
      move(ev);
    };
    const finish = (ev, fn) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onCancel);
      fn?.(ev);
    };
    const onUp = (ev) => finish(ev, up);
    const onCancel = () => finish(null, cancel);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onCancel);
  }

  edgeScroll(ev) {
    const box = this.wrap.getBoundingClientRect();
    if (ev.clientY > box.bottom - EDGE_SCROLL) this.wrap.scrollTop += 16;
    else if (ev.clientY < box.top + EDGE_SCROLL + this.heads[0].offsetHeight) this.wrap.scrollTop -= 16;
    if (ev.clientX > box.right - EDGE_SCROLL) this.wrap.scrollLeft += 16;
    else if (ev.clientX < box.left + EDGE_SCROLL + ROW_HEAD_WIDTH) this.wrap.scrollLeft -= 16;
  }

  /** The cell under a pointer, or null when it is not over a cell. */
  cellAt(ev) {
    return posOf(document.elementFromPoint(ev.clientX, ev.clientY));
  }
}

/** CSS class for how a value is shown. */
function cellKind(value) {
  if (isError(value)) return 'err';
  if (typeof value === 'number') return 'num';
  if (typeof value === 'boolean') return 'bool';
  return '';
}

/** Position an overlay element with a transform. */
function place(node, rect) {
  node.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
  node.style.width = `${rect.width}px`;
  node.style.height = `${rect.height}px`;
}
