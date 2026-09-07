import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);
let uid = 0;

export class ClassList {
  constructor(el) {
    this.el = el;
    this.set = new Set(String(el.attrs.class || '').split(/\s+/).filter(Boolean));
  }
  _sync() { this.el.attrs.class = [...this.set].join(' '); }
  add(...c) { c.filter(Boolean).forEach((x) => this.set.add(x)); this._sync(); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); this._sync(); }
  toggle(c, force) {
    const has = this.set.has(c);
    const want = force === undefined ? !has : force;
    want ? this.set.add(c) : this.set.delete(c);
    this._sync();
    return want;
  }
  contains(c) { return this.set.has(c); }
}

export class El {
  constructor(tag, attrs = {}) {
    this._uid = ++uid;
    this.tagName = String(tag).toLowerCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parent = null;
    this.listeners = {};
    this.classList = new ClassList(this);
    this.style = {};
    this._text = '';
    this._value = attrs.value !== undefined ? attrs.value : '';
    const dkey = (k) => 'data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    this.dataset = new Proxy({}, {
      get: (_t, k) => this.attrs[dkey(k)],
      set: (_t, k, v) => { this.attrs[dkey(k)] = String(v); return true; },
    });
  }
  get id() { return this.attrs.id || ''; }
  get value() { return this._value; }
  set value(v) { this._value = String(v); }
  get textContent() {
    if (this._text) return this._text;
    return this.children.map((c) => (c instanceof El ? c.textContent : String(c))).join('');
  }
  set textContent(v) { this.children = []; this._text = String(v); }
  set innerHTML(html) { this.children = parseHTML(html, this); }
  get innerHTML() { return ''; }
  set outerHTML(html) {
    if (!this.parent) return;
    const nodes = parseHTML(html, this.parent);
    const i = this.parent.children.indexOf(this);
    this.parent.children.splice(i, 1, ...nodes);
    nodes.forEach((n) => (n.parent = this.parent));
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] !== undefined ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(n) { if (n.parent) n.parent.children = n.parent.children.filter((x) => x !== n); n.parent = this; this.children.push(n); }
  insertAdjacentHTML(_pos, html) { const nodes = parseHTML(html, this); nodes.forEach((n) => (n.parent = this)); this.children.push(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, props = {}) { dispatch(this, type, props); }
  focus() {}
  querySelector(sel) { return querySelectorAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return querySelectorAll(this, sel); }
  closest(sel) {
    let n = this;
    while (n && n.tagName !== '#document') {
      if (matches(n, sel)) return n;
      n = n.parent;
    }
    return null;
  }
}

export function matchesSimple(el, tok) {
  if (!el || el.tagName === '#document') return false;
  const parts = tok.match(/^([a-z0-9]*)((?:[.#][\w-]+|\[[^\]]+\])*)$/i);
  if (!parts) return false;
  const [, tag, rest] = parts;
  if (tag && el.tagName !== tag.toLowerCase()) return false;
  const restToks = rest.match(/([.#][\w-]+|\[[^\]]+\])/g) || [];
  for (const r of restToks) {
    if (r.startsWith('.')) { if (!el.classList.contains(r.slice(1))) return false; }
    else if (r.startsWith('#')) { if (el.attrs.id !== r.slice(1)) return false; }
    else {
      const mm = r.match(/^\[([a-zA-Z-]+)(?:="([^"]*)")?\]$/);
      if (!mm) return false;
      if (el.attrs[mm[1]] === undefined) return false;
      if (mm[2] !== undefined && el.attrs[mm[1]] !== mm[2]) return false;
    }
  }
  return true;
}

export function matches(el, sel) {
  const toks = sel.trim().split(/\s+/);
  if (!matchesSimple(el, toks[toks.length - 1])) return false;
  let anc = el.parent;
  let i = toks.length - 2;
  while (i >= 0 && anc && anc.tagName !== '#document') {
    if (matchesSimple(anc, toks[i])) i--;
    anc = anc.parent;
  }
  return i < 0;
}

export function parseHTML(html, parent) {
  const nodes = [];
  const stack = [{ tag: null, children: nodes, node: parent }];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    const text = html.slice(last, m.index);
    if (text.trim() && stack[stack.length - 1].node instanceof El) {
      stack[stack.length - 1].children.push(text.replace(/\s+/g, ' ').trim());
    }
    last = m.index + m[0].length;
    const top = stack[stack.length - 1];
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === m[2].toLowerCase()) { stack.length = i; break; }
      }
      continue;
    }
    const attrs = {};
    const are = /([a-zA-Z_][a-zA-Z0-9_-]*)(?:="([^"]*)")?/g;
    let am;
    while ((am = are.exec(m[3] || ''))) attrs[am[1]] = am[2] !== undefined ? am[2] : '';
    const el = new El(m[2], attrs);
    el.parent = top.node;
    top.children.push(el);
    if (!VOID.has(el.tagName) && !m[4]) stack.push({ tag: el.tagName, children: el.children, node: el });
  }
  return nodes;
}

export function querySelectorAll(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children || []) {
      if (c instanceof El && matches(c, sel)) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

export function querySelector(root, sel) {
  return querySelectorAll(root, sel)[0] || null;
}

export class Document extends El {
  constructor() {
    super('#document');
    this.documentElement = new El('html');
    this.body = new El('body');
    this.documentElement.appendChild(this.body);
    this.body.parent = this.documentElement;
    this.documentElement.parent = this;
    this.appendChild(this.documentElement);
    this.registry = new Map();
  }
  createElement(tag) { return new El(tag); }
  getElementById(id) { return this.registry.get(id) || null; }
  querySelector(sel) { return querySelectorAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return querySelectorAll(this, sel); }
  register(el) { if (el.attrs.id) this.registry.set(el.attrs.id, el); }
}

export function attachDoc(doc, root) {
  root.parent = doc.body;
  doc.body.children.push(root);
  const reg = (n) => {
    if (n instanceof El) {
      if (n.attrs.id) doc.register(n);
      (n.children || []).forEach(reg);
    }
  };
  reg(root);
  const origInner = Object.getOwnPropertyDescriptor(El.prototype, 'innerHTML');
  Object.defineProperty(root, 'innerHTML', {
    set(v) { origInner.set.call(this, v); (function reg(n) { if (n.attrs && n.attrs.id) doc.register(n); (n.children || []).forEach(reg); })(this); },
    get() { return origInner.get.call(this); },
    configurable: true,
  });
}

export function dispatch(target, type, props = {}) {
  const ev = {
    target,
    key: props.key,
    closest(sel) { let n = target; while (n && n.tagName !== '#document') { if (matches(n, sel)) return n; n = n.parent; } return null; },
    preventDefault() {},
  };
  let n = target;
  while (n && n.tagName !== '#document') {
    (n.listeners[type] || []).forEach((fn) => fn(ev));
    n = n.parent;
  }
  (n && n.listeners[type] || []).forEach((fn) => fn(ev));
}

export class FakeTimers {
  constructor() { this.pending = new Map(); this.next = 1; }
  setTimeout(fn, _ms) { const id = this.next++; this.pending.set(id, fn); return id; }
  clearTimeout(id) { this.pending.delete(id); }
  flush() { const fns = [...this.pending.values()]; this.pending.clear(); fns.forEach((fn) => fn()); }
}

export class MemStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  key(i) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function transformModule(src, bootId, relTo) {
  return src.replace(/from\s+'([^']+?)'/g, (m, rel) => {
    if (rel.startsWith('node:')) return m;
    const abs = path.resolve(relTo, rel);
    return `from 'file://${abs}?boot=${bootId}'`;
  }) + `\n//boot=${bootId}`;
}

export function dataImport(code) {
  return import('data:text/javascript,' + encodeURIComponent(code));
}
