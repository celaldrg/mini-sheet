// App controller: wires the sheet engine to the grid view, toolbar, menus,
// keyboard, clipboard, CSV files and saving.
import { ROWS, COLS, makeRange, addressName, rangeName } from './refs.js';
import { createSheet } from './sheet.js';
import { isError } from './values.js';
import { formatValue } from './format.js';
import { exampleData, EXAMPLE_IDS, createDemo } from './examples.js';
import { translate, errorHintKey } from './i18n.js';
import { loadItem, saveItem } from './storage.js';
import { GridView } from './grid.js';
import { PopupMenu } from './menu.js';

const SAVE_DELAY = 300;
const MESSAGE_MS = 3500;
const FORMAT_BUTTONS = ['general', 'fixed2', 'percent', 'thousands'];

const $ = (id) => document.getElementById(id);

const isDemo = new URLSearchParams(location.search).has('demo');
const app = {
  lang: loadItem('lang', 'en') === 'tr' ? 'tr' : 'en',
  sheet: createSheet(),
  active: { row: 0, col: 0 },
  anchor: { row: 0, col: 0 },
  sel: makeRange(0, 0),
  /** @type {{source:'cell'|'bar', quick:boolean}|null} */
  editing: null,
  clip: null,
  clipText: '',
  message: '',
  messageTimer: 0,
  saveTimer: 0,
};

const view = new GridView($('grid-wrap'), {
  select: (pos, extend) => selectCell(pos, extend),
  extend: (pos) => extendTo(pos),
  selectRange: (range, pos) => setSelection(range, pos, pos),
  edit: (pos) => {
    selectCell(pos, false);
    startEdit(app.sheet.getRaw(pos.row, pos.col), 'cell', false);
  },
  fillTarget: (pos) => fillTarget(pos),
  fill: (target) => fillTo(target),
  resize: (col, width) => change(() => app.sheet.setColumnWidth(col, width)),
  menu: (x, y, pos) => openCellMenu(x, y, pos),
  pointerStart: () => commitEdit(0, 0),
});
const menu = new PopupMenu($('menu'));

/** @param {string} key @param {object} [params] */
function t(key, params) {
  return translate(app.lang, key, params);
}

/** Tooltip text for an error cell; a formula that cannot be parsed gets its own hint. */
function errorHint(code, row, col) {
  if (app.sheet.hasSyntaxError(row, col)) return t('err_SYNTAX');
  return t(errorHintKey(code) ?? 'err_VALUE');
}

// ---- drawing ------------------------------------------------------------------

function render() {
  view.setWidths(app.sheet.colWidths);
  view.renderCells(app.sheet, app.lang, errorHint);
  view.drawSelection(app.sel, app.active, !isCoarse());
  renderBar();
  renderStatus();
  renderButtons();
}

function renderBar() {
  const { row, col } = app.active;
  $('addr').textContent = app.sel.top === app.sel.bottom && app.sel.left === app.sel.right
    ? addressName(row, col) : rangeName(app.sel);
  if (!app.editing) $('bar-input').value = app.sheet.getRaw(row, col);
}

function renderStatus() {
  const stats = $('status-stats');
  const single = app.sel.top === app.sel.bottom && app.sel.left === app.sel.right;
  if (single) stats.textContent = '';
  else {
    const s = app.sheet.rangeStats(app.sel);
    const num = (n) => formatValue(n, 'thousands', app.lang);
    stats.textContent = [
      `${t('sum')}: ${num(s.sum)}`,
      s.average === null ? null : `${t('average')}: ${num(s.average)}`,
      `${t('count')}: ${s.count}`,
    ].filter(Boolean).join(' · ');
  }
  const value = app.sheet.getValue(app.active.row, app.active.col);
  const hint = isError(value) ? errorHint(value.code, app.active.row, app.active.col) : '';
  const msg = $('status-msg');
  msg.textContent = app.message || hint || (single ? t('ready') : '');
  msg.classList.toggle('is-error', !app.message && Boolean(hint));
}

function renderButtons() {
  $('btn-undo').disabled = !app.sheet.canUndo();
  $('btn-redo').disabled = !app.sheet.canRedo();
  const format = app.sheet.getFormat(app.active.row, app.active.col);
  for (const btn of document.querySelectorAll('[data-format]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.format === format));
  }
}

function showMessage(text) {
  app.message = text;
  clearTimeout(app.messageTimer);
  app.messageTimer = setTimeout(() => {
    app.message = '';
    renderStatus();
  }, MESSAGE_MS);
  renderStatus();
}

function applyLanguage() {
  document.documentElement.lang = app.lang;
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of document.querySelectorAll('[data-i18n-title]')) node.title = t(node.dataset.i18nTitle);
  for (const node of document.querySelectorAll('[data-i18n-aria]')) {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  }
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  view.setLabels(t);
  render();
}

function isCoarse() {
  return window.matchMedia('(pointer: coarse)').matches;
}

// ---- changes and saving ------------------------------------------------------

/**
 * Run an edit, then redraw and save when it changed something.
 * @param {()=>unknown} fn
 */
function change(fn) {
  const before = app.sheet.version;
  fn();
  if (app.sheet.version !== before) scheduleSave();
  render();
}

function scheduleSave() {
  if (isDemo) return;
  clearTimeout(app.saveTimer);
  app.saveTimer = setTimeout(() => saveItem('sheet', app.sheet.toJSON()), SAVE_DELAY);
}

// ---- selection ---------------------------------------------------------------

function clampPos(pos) {
  return {
    row: Math.max(0, Math.min(ROWS - 1, pos.row)),
    col: Math.max(0, Math.min(COLS - 1, pos.col)),
  };
}

function setSelection(range, active, anchor) {
  app.sel = range;
  app.active = active;
  app.anchor = anchor;
  render();
}

function selectCell(pos, extend) {
  if (extend) extendTo(pos);
  else setSelection(makeRange(pos.row, pos.col), pos, pos);
}

function extendTo(pos) {
  const p = clampPos(pos);
  app.sel = makeRange(app.anchor.row, app.anchor.col, p.row, p.col);
  render();
  view.reveal(p);
}

/** Move the active cell (or the far corner when extending). */
function move(dRow, dCol, extend) {
  if (extend) {
    const corner = {
      row: app.sel.top === app.anchor.row ? app.sel.bottom : app.sel.top,
      col: app.sel.left === app.anchor.col ? app.sel.right : app.sel.left,
    };
    extendTo({ row: corner.row + dRow, col: corner.col + dCol });
    return;
  }
  const p = clampPos({ row: app.active.row + dRow, col: app.active.col + dCol });
  selectCell(p, false);
  view.reveal(p);
}

// ---- editing -------------------------------------------------------------------

/**
 * Begin editing the active cell.
 * @param {string} text  starting text
 * @param {'cell'|'bar'} source
 * @param {boolean} quick  started by typing: arrow keys commit and move
 */
function startEdit(text, source, quick) {
  app.editing = { source, quick };
  $('bar-input').value = text;
  if (source === 'cell') view.openEditor(app.active, text);
}

/** Save the edit and move the active cell by (dRow, dCol). */
function commitEdit(dRow, dCol) {
  if (!app.editing) return;
  const text = app.editing.source === 'cell' ? view.editor.value : $('bar-input').value;
  endEdit();
  const { row, col } = app.active;
  change(() => app.sheet.setCell(row, col, text));
  if (dRow || dCol) move(dRow, dCol, false);
}

function cancelEdit() {
  if (!app.editing) return;
  endEdit();
  render();
}

function endEdit() {
  const wasCell = app.editing?.source === 'cell';
  app.editing = null;
  view.closeEditor();
  if (wasCell || document.activeElement === $('bar-input')) focusGrid();
}

function focusGrid() {
  $('grid-wrap').focus({ preventScroll: true });
}

/** Keys while an editor (cell or bar) has focus. */
function onEditorKey(e) {
  if (!app.editing) return;
  const quickArrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (e.key === 'Enter') commitEdit(e.shiftKey ? -1 : 1, 0);
  else if (e.key === 'Tab') commitEdit(0, e.shiftKey ? -1 : 1);
  else if (e.key === 'Escape') cancelEdit();
  else if (app.editing.quick && quickArrows[e.key]) commitEdit(...quickArrows[e.key]);
  else return;
  e.preventDefault();
}

// ---- keyboard on the grid -------------------------------------------------------

const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

/** Grid keys apply unless focus is in a text field, menu or dialog, or a button wants the key. */
function gridHasFocus(e) {
  const target = e.target;
  if (isTextField(target) || target.closest?.('.menu, dialog')) return false;
  const buttonKey = e.key === 'Enter' || e.key === ' ' || e.key === 'Tab';
  return !(buttonKey && target.closest?.('button, a'));
}

function onGridKey(e) {
  if (app.editing || menu.isOpen() || !gridHasFocus(e)) return;
  if (e.ctrlKey || e.metaKey) {
    if (onShortcut(e.key.toLowerCase(), e.shiftKey)) e.preventDefault();
    return;
  }
  if (onNavigationKey(e)) {
    e.preventDefault();
    return;
  }
  if (e.key.length === 1 && !e.altKey) {
    e.preventDefault();
    startEdit(e.key, 'cell', true);
  }
}

/** @returns {boolean} whether the key was handled */
function onShortcut(key, shift) {
  if (key === 'z' && !shift) change(() => app.sheet.undo());
  else if (key === 'y' || (key === 'z' && shift)) change(() => app.sheet.redo());
  else if (key === 'a') setSelection(makeRange(0, 0, ROWS - 1, COLS - 1), app.active, { row: 0, col: 0 });
  else return false;
  return true;
}

/** @returns {boolean} whether the key was handled */
function onNavigationKey(e) {
  if (ARROWS[e.key]) move(...ARROWS[e.key], e.shiftKey);
  else if (e.key === 'Tab') move(0, e.shiftKey ? -1 : 1, false);
  else if (e.key === 'Enter') move(e.shiftKey ? -1 : 1, 0, false);
  else if (e.key === 'F2') startEdit(app.sheet.getRaw(app.active.row, app.active.col), 'cell', false);
  else if (e.key === 'Delete' || e.key === 'Backspace') change(() => app.sheet.clearRange(app.sel));
  else if (e.key === 'Escape') app.clip = null;
  else return false;
  return true;
}

// ---- clipboard ---------------------------------------------------------------------

function isTextField(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function copySelection() {
  app.clip = app.sheet.copy(app.sel);
  app.clipText = app.sheet.rangeToTSV(app.sel);
  showMessage(t('copied', { range: rangeName(app.sel) }));
  return app.clipText;
}

/** Paste text; our own copied text pastes with formulas and shifted references. */
function pasteAt(text) {
  const { row, col } = app.active;
  let range = null;
  change(() => {
    range = app.clip && text === app.clipText
      ? app.sheet.paste(app.clip, row, col)
      : app.sheet.pasteText(text, row, col);
  });
  if (range) {
    setSelection(range, app.active, app.active);
    showMessage(t('pasted', { cell: addressName(row, col) }));
  }
}

function onCopy(e) {
  if (app.editing || isTextField(e.target)) return;
  e.clipboardData.setData('text/plain', copySelection());
  e.preventDefault();
}

function onPaste(e) {
  if (app.editing || isTextField(e.target)) return;
  e.preventDefault();
  pasteAt(e.clipboardData.getData('text/plain'));
}

function menuCopy() {
  const text = copySelection();
  navigator.clipboard?.writeText(text).catch(() => {});
}

function menuPaste() {
  if (app.clip) {
    pasteAt(app.clipText);
    return;
  }
  const read = navigator.clipboard?.readText?.();
  if (!read) {
    showMessage(t('nothingToPaste'));
    return;
  }
  read.then((text) => (text ? pasteAt(text) : showMessage(t('nothingToPaste'))))
    .catch(() => showMessage(t('nothingToPaste')));
}

// ---- fill, rows and columns --------------------------------------------------------

/** The area a fill handle dragged to pos would cover, or null. */
function fillTarget(pos) {
  const { sel } = app;
  const dRow = pos.row > sel.bottom ? pos.row - sel.bottom : Math.min(0, pos.row - sel.top);
  const dCol = pos.col > sel.right ? pos.col - sel.right : Math.min(0, pos.col - sel.left);
  if (!dRow && !dCol) return null;
  if (Math.abs(dRow) >= Math.abs(dCol)) {
    return makeRange(Math.min(sel.top, pos.row), sel.left, Math.max(sel.bottom, pos.row), sel.right);
  }
  return makeRange(sel.top, Math.min(sel.left, pos.col), sel.bottom, Math.max(sel.right, pos.col));
}

function fillTo(target) {
  const source = app.sel;
  change(() => app.sheet.fill(source, target));
  setSelection(target, app.active, app.anchor);
}

function selectionSize() {
  return { rows: app.sel.bottom - app.sel.top + 1, cols: app.sel.right - app.sel.left + 1 };
}

function restructure(fn) {
  change(fn);
  const p = clampPos(app.active);
  setSelection(makeRange(p.row, p.col), p, p);
}

function insertRows(below) {
  const { rows } = selectionSize();
  const at = below ? app.sel.bottom + 1 : app.sel.top;
  if (at < ROWS) restructure(() => app.sheet.insertRows(at, rows));
}

function insertCols(right) {
  const { cols } = selectionSize();
  const at = right ? app.sel.right + 1 : app.sel.left;
  if (at < COLS) restructure(() => app.sheet.insertCols(at, cols));
}

function cellMenuEntries() {
  const { rows, cols } = selectionSize();
  return [
    { label: t('copy'), run: menuCopy },
    { label: t('paste'), run: menuPaste },
    { label: t('clear'), run: () => change(() => app.sheet.clearRange(app.sel)) },
    'separator',
    { label: t('fillDown'), run: () => change(() => app.sheet.fillDown(app.sel)), disabled: rows < 2 },
    { label: t('fillRight'), run: () => change(() => app.sheet.fillRight(app.sel)), disabled: cols < 2 },
    'separator',
    { label: t('insertRowAbove'), run: () => insertRows(false) },
    { label: t('insertRowBelow'), run: () => insertRows(true), disabled: app.sel.bottom >= ROWS - 1 },
    { label: t('deleteRows'), run: () => restructure(() => app.sheet.deleteRows(app.sel.top, rows)) },
    'separator',
    { label: t('insertColLeft'), run: () => insertCols(false) },
    { label: t('insertColRight'), run: () => insertCols(true), disabled: app.sel.right >= COLS - 1 },
    { label: t('deleteCols'), run: () => restructure(() => app.sheet.deleteCols(app.sel.left, cols)) },
  ];
}

function openCellMenu(x, y, pos) {
  const { sel } = app;
  const inside = pos && pos.row >= sel.top && pos.row <= sel.bottom && pos.col >= sel.left && pos.col <= sel.right;
  if (pos && !inside) selectCell(pos, false);
  menu.open(cellMenuEntries(), x, y);
}

// ---- files and examples --------------------------------------------------------------

function importText(text) {
  let info = null;
  change(() => { info = app.sheet.importCSV(text); });
  setSelection(makeRange(0, 0), { row: 0, col: 0 }, { row: 0, col: 0 });
  showMessage(t(info.truncated ? 'importedTruncated' : 'imported', { rows: info.rows, cols: info.cols }));
}

function importFile(file) {
  if (!file) return;
  file.text().then(importText).catch(() => showMessage(t('importFailed')));
}

function exportCSV(formulas) {
  const name = formulas ? 'mini-sheet-formulas.csv' : 'mini-sheet.csv';
  const blob = new Blob([app.sheet.exportCSV({ formulas })], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showMessage(t('exported', { name }));
}

function openCsvDialog() {
  const dialog = $('csv-dialog');
  $('csv-text').value = '';
  dialog.returnValue = '';
  dialog.showModal();
  $('csv-text').focus();
}

function loadExample(id) {
  change(() => app.sheet.loadJSON(exampleData(id, app.lang), { record: true }));
  setSelection(makeRange(0, 0), { row: 0, col: 0 }, { row: 0, col: 0 });
  showMessage(t('loadedExample', { name: t(`example_${id}`) }));
}

function newSheet() {
  change(() => app.sheet.loadJSON({ cells: [] }, { record: true }));
  setSelection(makeRange(0, 0), { row: 0, col: 0 }, { row: 0, col: 0 });
  showMessage(t('cleared'));
}

// ---- wiring --------------------------------------------------------------------------

function bindToolbar() {
  $('btn-new').addEventListener('click', newSheet);
  $('btn-undo').addEventListener('click', () => change(() => app.sheet.undo()));
  $('btn-redo').addEventListener('click', () => change(() => app.sheet.redo()));
  $('btn-lang').addEventListener('click', () => {
    app.lang = app.lang === 'en' ? 'tr' : 'en';
    saveItem('lang', app.lang);
    applyLanguage();
  });
  for (const btn of document.querySelectorAll('[data-format]')) {
    btn.addEventListener('click', () => change(() => app.sheet.setFormat(app.sel, btn.dataset.format)));
  }
  $('btn-examples').addEventListener('click', (e) => menu.openBelow(
    EXAMPLE_IDS.map((id) => ({ label: t(`example_${id}`), run: () => loadExample(id) })), e.currentTarget,
  ));
  $('btn-csv').addEventListener('click', (e) => menu.openBelow([
    { label: t('importFile'), run: () => $('file-input').click() },
    { label: t('importText'), run: openCsvDialog },
    'separator',
    { label: t('exportValues'), run: () => exportCSV(false) },
    { label: t('exportFormulas'), run: () => exportCSV(true) },
  ], e.currentTarget));
  $('btn-more').addEventListener('click', (e) => menu.openBelow(cellMenuEntries(), e.currentTarget));
}

function bindEditors() {
  view.editor.addEventListener('keydown', onEditorKey);
  view.editor.addEventListener('input', () => { $('bar-input').value = view.editor.value; });
  view.editor.addEventListener('blur', () => {
    if (app.editing?.source === 'cell') commitEdit(0, 0);
  });
  const bar = $('bar-input');
  bar.addEventListener('focus', () => {
    if (!app.editing) startEdit(bar.value, 'bar', false);
  });
  bar.addEventListener('keydown', onEditorKey);
  bar.addEventListener('blur', () => {
    if (app.editing?.source === 'bar') commitEdit(0, 0);
  });
}

function bindFiles() {
  $('file-input').addEventListener('change', (e) => {
    importFile(e.target.files[0]);
    e.target.value = '';
  });
  const dialog = $('csv-dialog');
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'import') importText($('csv-text').value);
    focusGrid();
  });
  const wrap = $('grid-wrap');
  wrap.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    wrap.classList.add('dropping');
  });
  wrap.addEventListener('dragleave', () => wrap.classList.remove('dropping'));
  wrap.addEventListener('drop', (e) => {
    wrap.classList.remove('dropping');
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    importFile(e.dataTransfer.files[0]);
  });
}

function bindGlobal() {
  document.addEventListener('keydown', onGridKey);
  document.addEventListener('copy', onCopy);
  document.addEventListener('paste', onPaste);
  window.addEventListener('resize', () => render());
}

function loadInitial() {
  if (isDemo) {
    const demo = createDemo({ lang: app.lang });
    app.sheet = demo.sheet;
    app.active = demo.active;
    app.anchor = demo.active;
    app.sel = demo.selection;
    return;
  }
  const saved = loadItem('sheet', null);
  if (saved) app.sheet.loadJSON(saved);
}

loadInitial();
bindToolbar();
bindEditors();
bindFiles();
bindGlobal();
applyLanguage();
