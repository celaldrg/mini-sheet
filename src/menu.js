// A small popup menu used for dropdowns and the cell context menu.

/**
 * @typedef {{label:string, run:()=>void, disabled?:boolean}} MenuItem
 * @typedef {MenuItem|'separator'} MenuEntry
 */

export class PopupMenu {
  /** @param {HTMLElement} root  an empty element that hosts the menu */
  constructor(root) {
    this.root = root;
    this.root.hidden = true;
    this.root.setAttribute('role', 'menu');
    this.returnFocus = null;
    this.onOutside = (e) => {
      if (!this.root.contains(e.target)) this.close();
    };
    this.root.addEventListener('keydown', (e) => this.onKey(e));
  }

  /**
   * Open the menu at a screen point, kept inside the viewport.
   * @param {MenuEntry[]} entries
   * @param {number} x
   * @param {number} y
   */
  open(entries, x, y) {
    this.returnFocus = document.activeElement;
    this.root.replaceChildren(...entries.map((entry) => this.entryNode(entry)));
    this.root.hidden = false;
    const { width, height } = this.root.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = y + height > window.innerHeight - 8 ? Math.max(8, y - height) : y;
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener('pointerdown', this.onOutside, true), 0);
  }

  /**
   * Open the menu below an anchor element.
   * @param {MenuEntry[]} entries
   * @param {HTMLElement} anchor
   */
  openBelow(entries, anchor) {
    const r = anchor.getBoundingClientRect();
    this.open(entries, r.left, r.bottom + 4);
  }

  close() {
    if (this.root.hidden) return;
    this.root.hidden = true;
    document.removeEventListener('pointerdown', this.onOutside, true);
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  /** @returns {boolean} */
  isOpen() {
    return !this.root.hidden;
  }

  entryNode(entry) {
    if (entry === 'separator') {
      const hr = document.createElement('div');
      hr.className = 'menu-sep';
      hr.setAttribute('role', 'separator');
      return hr;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = entry.label;
    button.disabled = Boolean(entry.disabled);
    button.addEventListener('click', () => {
      this.close();
      entry.run();
    });
    return button;
  }

  onKey(e) {
    const items = [...this.root.querySelectorAll('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') this.close();
    else if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
}
