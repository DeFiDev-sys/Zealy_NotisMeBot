interface Element {
  querySelector(selectors: string): Element | null;
  querySelectorAll(selectors: string): NodeListOf<Element>;
  textContent: string | null;
  tagName: string;
  innerHTML: string;
  innerText: string;
}

interface HTMLAnchorElement extends Element {
  href: string;
  id: string;
}

interface NodeListOf<T> {
  length: number;
  item(index: number): T | null;
  forEach(callback: (value: T, key: number, parent: NodeListOf<T>) => void): void;
  [Symbol.iterator](): IterableIterator<T>;
}