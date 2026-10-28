// UI strings in English and Turkish. Pure, no DOM.

/** Supported UI languages. */
export const LANGS = Object.freeze(['en', 'tr']);

const EN = {
  appTitle: 'Mini Sheet',
  newSheet: 'New',
  newSheetTitle: 'Start an empty sheet',
  langToggle: 'TR',
  langToggleTitle: 'TR: switch to Turkish',
  undo: 'Undo',
  redo: 'Redo',
  undoTitle: 'Undo (Ctrl+Z)',
  redoTitle: 'Redo (Ctrl+Y)',
  formatGeneral: 'General',
  formatFixed2: '0.00',
  formatPercent: '%',
  formatThousands: '1,000',
  formatGeneralTitle: 'General number format',
  formatFixed2Title: 'Two decimals',
  formatPercentTitle: 'Percent',
  formatThousandsTitle: 'Thousands separators',
  examples: 'Examples',
  example_budget: 'Monthly budget',
  example_grades: 'Grade book',
  example_multiplication: 'Multiplication table',
  csv: 'CSV',
  importFile: 'Import CSV file…',
  importText: 'Paste CSV text…',
  exportValues: 'Export CSV (values)',
  exportFormulas: 'Export CSV (formulas)',
  more: 'More',
  moreTitle: 'Cell actions',
  copy: 'Copy',
  paste: 'Paste',
  clear: 'Clear contents',
  fillDown: 'Fill down',
  fillRight: 'Fill right',
  insertRowAbove: 'Insert row above',
  insertRowBelow: 'Insert row below',
  deleteRows: 'Delete row(s)',
  insertColLeft: 'Insert column left',
  insertColRight: 'Insert column right',
  deleteCols: 'Delete column(s)',
  cellAddress: 'Cell address',
  formulaInput: 'Cell content',
  formulaPlaceholder: 'Type a value or =formula',
  gridLabel: 'Sheet grid',
  sum: 'Sum',
  average: 'Average',
  count: 'Count',
  ready: 'Ready. Type to edit, or open Examples.',
  csvDialogTitle: 'Paste CSV text',
  csvDialogHint: 'The sheet is replaced. You can undo it.',
  import: 'Import',
  cancel: 'Cancel',
  imported: 'Imported {rows} rows × {cols} columns.',
  importedTruncated: 'Imported {rows} rows × {cols} columns (cut to fit 100 × 26).',
  importFailed: 'Could not read that file.',
  exported: 'Saved {name}.',
  copied: 'Copied {range}.',
  pasted: 'Pasted at {cell}.',
  nothingToPaste: 'Nothing to paste yet. Copy a range first.',
  loadedExample: 'Loaded: {name}.',
  cleared: 'Empty sheet. Undo brings the old one back.',
  dropHint: 'Drop a CSV file to import it',
  footerLicense: 'MIT',
  footerSource: 'Source on GitHub',
  resizeColumn: 'Drag to resize column {col}',
  fillHandle: 'Drag to fill',
  err_DIV0: '#DIV/0!: division by zero.',
  err_REF: '#REF!: the formula points to a cell that no longer exists.',
  err_NAME: '#NAME?: unknown function or name, or a formula that cannot be read.',
  err_VALUE: '#VALUE!: a value has the wrong type, such as text where a number is needed.',
  err_NA: '#N/A: the value was not found.',
  err_CYCLE: '#CYCLE!: this cell depends on itself through a circular reference.',
  err_SYNTAX: '#NAME?: the formula cannot be read; check for a missing operand, bracket or quote.',
};

const TR = {
  appTitle: 'Mini Sheet',
  newSheet: 'Yeni',
  newSheetTitle: 'Boş bir sayfa başlat',
  langToggle: 'EN',
  langToggleTitle: 'EN: İngilizceye geç',
  undo: 'Geri al',
  redo: 'Yinele',
  undoTitle: 'Geri al (Ctrl+Z)',
  redoTitle: 'Yinele (Ctrl+Y)',
  formatGeneral: 'Genel',
  formatFixed2: '0,00',
  formatPercent: '%',
  formatThousands: '1.000',
  formatGeneralTitle: 'Genel sayı biçimi',
  formatFixed2Title: 'İki ondalık',
  formatPercentTitle: 'Yüzde',
  formatThousandsTitle: 'Binlik ayırıcı',
  examples: 'Örnekler',
  example_budget: 'Aylık bütçe',
  example_grades: 'Not defteri',
  example_multiplication: 'Çarpım tablosu',
  csv: 'CSV',
  importFile: 'CSV dosyası içe aktar…',
  importText: 'CSV metni yapıştır…',
  exportValues: 'CSV dışa aktar (değerler)',
  exportFormulas: 'CSV dışa aktar (formüller)',
  more: 'Diğer',
  moreTitle: 'Hücre işlemleri',
  copy: 'Kopyala',
  paste: 'Yapıştır',
  clear: 'İçeriği temizle',
  fillDown: 'Aşağı doldur',
  fillRight: 'Sağa doldur',
  insertRowAbove: 'Üste satır ekle',
  insertRowBelow: 'Alta satır ekle',
  deleteRows: 'Satır(lar)ı sil',
  insertColLeft: 'Sola sütun ekle',
  insertColRight: 'Sağa sütun ekle',
  deleteCols: 'Sütun(lar)ı sil',
  cellAddress: 'Hücre adresi',
  formulaInput: 'Hücre içeriği',
  formulaPlaceholder: 'Bir değer ya da =formül yazın',
  gridLabel: 'Tablo',
  sum: 'Toplam',
  average: 'Ortalama',
  count: 'Adet',
  ready: 'Hazır. Düzenlemek için yazın ya da Örnekler’i açın.',
  csvDialogTitle: 'CSV metni yapıştır',
  csvDialogHint: 'Sayfanın yerine geçer. Geri alabilirsiniz.',
  import: 'İçe aktar',
  cancel: 'Vazgeç',
  imported: '{rows} satır × {cols} sütun içe aktarıldı.',
  importedTruncated: '{rows} satır × {cols} sütun içe aktarıldı (100 × 26’ya sığdırıldı).',
  importFailed: 'Bu dosya okunamadı.',
  exported: '{name} kaydedildi.',
  copied: '{range} kopyalandı.',
  pasted: '{cell} hücresine yapıştırıldı.',
  nothingToPaste: 'Yapıştıracak bir şey yok. Önce bir aralık kopyalayın.',
  loadedExample: 'Yüklendi: {name}.',
  cleared: 'Boş sayfa. Geri al eskisini getirir.',
  dropHint: 'İçe aktarmak için bir CSV dosyası bırakın',
  footerLicense: 'MIT',
  footerSource: 'Kaynak kod GitHub’da',
  resizeColumn: '{col} sütununu genişletmek için sürükleyin',
  fillHandle: 'Doldurmak için sürükleyin',
  err_DIV0: '#DIV/0!: sıfıra bölme.',
  err_REF: '#REF!: formül artık var olmayan bir hücreyi gösteriyor.',
  err_NAME: '#NAME?: bilinmeyen işlev ya da ad, veya okunamayan formül.',
  err_VALUE: '#VALUE!: değerin türü yanlış, örneğin sayı yerine metin.',
  err_NA: '#N/A: değer bulunamadı.',
  err_CYCLE: '#CYCLE!: bu hücre döngüsel bir başvuruyla kendine bağlı.',
  err_SYNTAX: '#NAME?: formül okunamıyor; eksik işlenen, parantez ya da tırnak olabilir.',
};

const STRINGS = Object.freeze({ en: EN, tr: TR });

/**
 * Translate a key, filling {placeholders} from params.
 * @param {string} lang  'en' or 'tr'
 * @param {string} key
 * @param {Record<string, string|number>} [params]
 * @returns {string}
 */
export function translate(lang, key, params = {}) {
  const table = STRINGS[lang] ?? EN;
  const text = table[key] ?? EN[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

/**
 * The tooltip key for an error code such as "#DIV/0!".
 * @param {string} code
 * @returns {string|null}
 */
export function errorHintKey(code) {
  const map = {
    '#DIV/0!': 'err_DIV0',
    '#REF!': 'err_REF',
    '#NAME?': 'err_NAME',
    '#VALUE!': 'err_VALUE',
    '#N/A': 'err_NA',
    '#CYCLE!': 'err_CYCLE',
  };
  return map[code] ?? null;
}

/**
 * Keys present in one language but missing in another (for tests).
 * @returns {string[]}
 */
export function missingKeys() {
  const all = new Set([...Object.keys(EN), ...Object.keys(TR)]);
  return [...all].filter((k) => !(k in EN) || !(k in TR));
}
