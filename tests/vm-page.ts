// Runs the page's scripts as the page runs them, in a fresh node:vm context: cities.js, a classic
// script, and then the compiled app.js, an ES module that imports './astro-calc.js'. No browser
// and no DOM library: a stub of the page parts app.js touches, a canvas whose 2d context records
// every drawing call, fetch answering stars.json from the repository, and a clock fixed at a given
// instant. A test then types in the city search, presses keys, picks a city, types coordinates,
// presses Update and Live View and moves the mouse over the chart, through the same listeners the
// page uses, and reads what the page shows and what it drew.
//
// The module. Node's vm runs ES modules only behind an experimental flag, so app.js runs as a
// strict classic script in the context instead: its one import line, the only import or export in
// it (checked), becomes a const that takes the same five functions from astro-calc.js, which Node
// imports as the real ES module it is. Nothing else in app.js is changed.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

type Listener = (event: StubEvent) => void;

/** The parts of an event app.js reads. */
interface StubEvent {
  type: string;
  target?: StubElement | null;
  key?: string;
  clientX?: number;
  clientY?: number;
  defaultPrevented: boolean;
  preventDefault(): void;
}

const event = (type: string, extra: Partial<StubEvent> = {}): StubEvent => ({
  type,
  defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true; },
  ...extra,
});

/** A page element with only what app.js uses. `hidden` reflects the hidden attribute, as in the DOM. */
class StubElement {
  textContent = '';
  readonly tag: string;
  readonly id: string;
  readonly classes: Set<string>;
  readonly attrs = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly children: StubElement[] = [];
  parentElement: StubElement | null = null;
  readonly listeners = new Map<string, Listener[]>();
  readonly page: { focus: string | null };
  #html = '';
  #value = '';
  constructor(page: { focus: string | null }, tag: string, id = '', classes: string[] = []) {
    this.page = page; this.tag = tag; this.id = id; this.classes = new Set(classes);
  }
  /** A field's value is text, as in the DOM: a number set into it is converted. */
  get value(): string { return this.#value; }
  set value(v: string) { this.#value = String(v); }
  get hidden(): boolean { return this.attrs.has('hidden'); }
  set hidden(on: boolean) { if (on) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }
  get innerText(): string { return this.textContent; }
  set innerText(text: string) { this.textContent = text; }
  get classList(): { add(c: string): void; remove(c: string): void; toggle(c: string, on?: boolean): boolean; contains(c: string): boolean } {
    const set = this.classes;
    return {
      add: (c) => { set.add(c); },
      remove: (c) => { set.delete(c); },
      toggle: (c, on) => { const want = on ?? !set.has(c); if (want) set.add(c); else set.delete(c); return want; },
      contains: (c) => set.has(c),
    };
  }
  /** Only the one piece of markup app.js writes (a dropdown row's two spans) and '' are understood. */
  get innerHTML(): string { return this.#html; }
  set innerHTML(html: string) {
    this.#html = html;
    for (const c of this.children.splice(0)) c.parentElement = null;
    if (html === '') return;
    if (html !== '<span class="city-name"></span><span class="city-country"></span>') throw new Error(`stub: unexpected markup ${html}`);
    this.appendChild(new StubElement(this.page, 'span', '', ['city-name']));
    this.appendChild(new StubElement(this.page, 'span', '', ['city-country']));
  }
  setAttribute(name: string, value: string): void { this.attrs.set(name, String(value)); }
  removeAttribute(name: string): void { this.attrs.delete(name); }
  getAttribute(name: string): string | null { return this.attrs.get(name) ?? null; }
  appendChild(child: StubElement): StubElement { this.children.push(child); child.parentElement = this; return child; }
  querySelector(sel: string): StubElement | null {
    if (!sel.startsWith('.')) throw new Error(`stub: selector ${sel}`);
    for (const c of this.children) { if (c.classes.has(sel.slice(1))) return c; const d = c.querySelector(sel); if (d) return d; }
    return null;
  }
  querySelectorAll(sel: string): StubElement[] {
    if (sel !== 'li') throw new Error(`stub: selector ${sel}`);
    return this.children.filter((c) => c.tag === 'li');
  }
  closest(sel: string): StubElement | null {
    if (!sel.startsWith('.')) throw new Error(`stub: selector ${sel}`);
    for (let e: StubElement | null = this; e; e = e.parentElement) if (e.classes.has(sel.slice(1))) return e;
    return null;
  }
  focus(): void { this.page.focus = this.id || this.tag; }
  addEventListener(type: string, fn: Listener): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  fire(type: string, extra: Partial<StubEvent> = {}): StubEvent {
    const e = event(type, { target: this, ...extra });
    for (const fn of this.listeners.get(type) ?? []) fn(e);
    return e;
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 600, height: 600 };
  }
}
// The kinds app.js checks with instanceof.
class StubInput extends StubElement {}
class StubButton extends StubElement {}
class StubUList extends StubElement {}

/** The canvas: its 2d context writes each call and each property set to a log. */
class StubCanvas extends StubElement {
  width = 600;
  height = 600;
  readonly log: unknown[][] = [];
  readonly context: Record<string, unknown>;
  constructor(page: { focus: string | null }, id: string) {
    super(page, 'canvas', id);
    const log = this.log;
    const ctx: Record<string, unknown> = {};
    for (const m of ['clearRect', 'beginPath', 'arc', 'stroke', 'fill', 'fillText']) {
      ctx[m] = (...args: unknown[]): void => { log.push([m, ...args]); };
    }
    for (const p of ['strokeStyle', 'fillStyle', 'font', 'textAlign', 'textBaseline', 'shadowBlur', 'shadowColor']) {
      let v: unknown = '';
      Object.defineProperty(ctx, p, { get: () => v, set: (x: unknown) => { v = x; log.push([`${p}=`, x]); }, enumerable: true });
    }
    this.context = ctx;
  }
  getContext(kind: string): Record<string, unknown> | null { return kind === '2d' ? this.context : null; }
}

/** A drawing: the calls since the last clearRect, as a count, a sha256 and a few totals. */
export interface Frame {
  calls: number;
  sha256: string;
  stars: number;
  labels: string[];
}

/** What the page shows. */
export interface PageState {
  tabs: { city: string; gps: string; cityPanelHidden: boolean; gpsPanelHidden: boolean };
  search: { value: string; expanded: string | null };
  dropdown: { hidden: boolean; rows: string[] };
  badge: { hidden: boolean; text: string };
  lat: { value: string; invalid: string | null; error: string; errorHidden: boolean };
  lon: { value: string; invalid: string | null; error: string; errorHidden: boolean };
  echo: { text: string; hidden: boolean };
  date: string;
  live: { classes: string; text: string; pending: number };
  map: { hidden: boolean; width: number; height: number };
  tooltip: { hidden: boolean; text: string; left: string; top: string };
  focus: string | null;
  frame: Frame;
}

export interface Page {
  state(): PageState;
  /** Every call of the canvas so far, and every console line. */
  totals(): { calls: number; sha256: string; console: string[]; fetched: string[]; fontLoads: string[] };
  /** Types text into the city search (replacing what is there), as the input event delivers it. */
  typeCity(text: string): void;
  /** A key press in the city search; true when the page prevented the default. */
  key(key: string): boolean;
  /** A click on dropdown row i, or the pointer entering it. */
  clickRow(i: number): void;
  hoverRow(i: number): void;
  /** A click on a page element by id (the tabs, the clear button, Update, Live View), or on the page outside the search. */
  click(id: string): void;
  clickOutside(): void;
  /** Types into a coordinate field (replacing it), as the input event delivers it. */
  typeCoord(which: 'lat' | 'lon', text: string): void;
  /** Sets the date and time field (the page reads it at the next drawing). */
  setDate(value: string): void;
  /** Moves the clock and runs the pending animation frame of Live View, if any. */
  frame(at: number): void;
  /** The pointer over the chart at (x, y), then off it. */
  hover(x: number, y: number): void;
  /** The tooltip alone (cheaper than state()). */
  tooltip(): PageState['tooltip'];
  leave(): void;
  /** A window resize event. */
  resize(): void;
}

/** Loads cities.js and app.js (with astro-calc.js) from root, a directory URL, at the instant now. */
export async function loadPage(root: URL, now: number): Promise<Page> {
  const page = { focus: null as string | null };
  const el = <T extends StubElement>(e: T, parent?: StubElement): T => { if (parent) parent.appendChild(e); return e; };
  const wrapper = new StubElement(page, 'div', '', ['search-wrapper']);
  const frameBox = new StubElement(page, 'div', '', ['canvas-wrapper']);
  const pageBox = new StubElement(page, 'main');
  const els = new Map<string, StubElement>();
  const add = (e: StubElement): void => { els.set(e.id, e); };
  const tabCity = el(new StubButton(page, 'button', 'tab-city', ['tab', 'active']));
  tabCity.dataset['tab'] = 'city'; tabCity.setAttribute('aria-selected', 'true');
  const tabGps = el(new StubButton(page, 'button', 'tab-gps', ['tab']));
  tabGps.dataset['tab'] = 'gps'; tabGps.setAttribute('aria-selected', 'false');
  const canvas = el(new StubCanvas(page, 'starmap-canvas'), frameBox);
  const lat = el(new StubInput(page, 'input', 'lat-input')); lat.value = '59.9139';
  const lon = el(new StubInput(page, 'input', 'lon-input')); lon.value = '10.7522';
  const search = el(new StubInput(page, 'input', 'city-search'), wrapper); search.setAttribute('aria-expanded', 'false');
  const dropdown = el(new StubUList(page, 'ul', 'city-dropdown'), wrapper); dropdown.hidden = true;
  const parts: StubElement[] = [
    tabCity, tabGps, canvas, lat, lon, search, dropdown,
    el(new StubElement(page, 'div', 'star-tooltip'), frameBox),
    new StubElement(page, 'div', 'panel-city'), new StubElement(page, 'div', 'panel-gps'),
    new StubElement(page, 'div', 'city-selected'), new StubElement(page, 'span', 'city-selected-text'),
    new StubButton(page, 'button', 'city-clear-btn'),
    new StubElement(page, 'p', 'lat-error'), new StubElement(page, 'p', 'lon-error'), new StubElement(page, 'p', 'gps-echo'),
    new StubInput(page, 'input', 'date-input'), new StubButton(page, 'button', 'update-btn'), new StubButton(page, 'button', 'live-btn'),
    new StubElement(page, 'span', 'live-text'), new StubElement(page, 'section', 'map-section'),
  ];
  for (const p of parts) add(p);
  const byId = (id: string): StubElement => { const e = els.get(id); if (!e) throw new Error(`no stub #${id}`); return e; };
  for (const id of ['panel-gps', 'city-selected', 'lat-error', 'lon-error', 'gps-echo', 'star-tooltip']) byId(id).hidden = true;
  byId('live-text').textContent = 'Live View: OFF';

  // The clock: new Date() and Date.now() give the instant; every other use is the real Date.
  let clock = now;
  class FixedDate extends Date {
    constructor(...args: [] | [number | string | Date]) {
      if (args.length === 0) super(clock); else super(args[0]);
    }
    static override now(): number { return clock; }
  }

  const docListeners = new Map<string, Listener[]>();
  const winListeners = new Map<string, Listener[]>();
  const frames = new Map<number, () => void>();
  let frameSeq = 0;
  const consoleLines: string[] = [];
  const fetched: string[] = [];
  const pending: Promise<unknown>[] = [];
  const fontLoads: string[] = [];
  const on = (map: Map<string, Listener[]>) => (type: string, fn: Listener): void => { map.set(type, [...(map.get(type) ?? []), fn]); };

  const sandbox = {
    Date: FixedDate,
    Element: StubElement,
    HTMLElement: StubElement,
    HTMLCanvasElement: StubCanvas,
    HTMLInputElement: StubInput,
    HTMLButtonElement: StubButton,
    HTMLUListElement: StubUList,
    window: { devicePixelRatio: 1, addEventListener: on(winListeners) },
    document: {
      getElementById: (id: string): StubElement | null => els.get(id) ?? null,
      addEventListener: on(docListeners),
      createElement: (tag: string): StubElement => new StubElement(page, tag),
      // The page waits for Inter before its first drawing (6 November 2026); here the face is
      // always there at once, and each request is recorded.
      fonts: { load: (font: string): Promise<unknown[]> => { fontLoads.push(font); const p = Promise.resolve([]); pending.push(p); return p; } },
    },
    requestAnimationFrame: (fn: () => void): number => { frames.set(++frameSeq, fn); return frameSeq; },
    cancelAnimationFrame: (id: number): void => { frames.delete(Number(id)); },
    fetch: (url: string): Promise<{ json(): Promise<unknown> }> => {
      fetched.push(url);
      const p = Promise.resolve({ json: async (): Promise<unknown> => JSON.parse(readFileSync(new URL(url, root), 'utf8')) });
      pending.push(p);
      return p;
    },
    console: { error: (...a: unknown[]): void => { consoleLines.push(`error: ${a.map(String).join(' ')}`); }, log: (...a: unknown[]): void => { consoleLines.push(`log: ${a.map(String).join(' ')}`); } },
  };
  const context = createContext(sandbox);
  runInContext(readFileSync(new URL('cities.js', root), 'utf8'), context, { filename: 'cities.js' });

  const astro = await import(new URL('astro-calc.js', root).href) as Record<string, unknown>;
  const app = readFileSync(new URL('app.js', root), 'utf8');
  const io = app.match(/^\s*(import|export)\b.*$/gm) ?? [];
  const IMPORT = /^import \{ ([A-Za-z, ]+) \} from '\.\/astro-calc\.js';$/m;
  const m = IMPORT.exec(app);
  if (io.length !== 1 || !m?.[1]) throw new Error(`app.js must have exactly one import, of ./astro-calc.js: ${io.join(' | ')}`);
  const names = m[1].split(', ');
  for (const n of names) if (typeof astro[n] !== 'function') throw new Error(`astro-calc.js does not export ${n}`);
  (context as Record<string, unknown>)['__astroCalc'] = astro;
  runInContext(app.replace(IMPORT, `"use strict"; const { ${names.join(', ')} } = globalThis.__astroCalc;`), context, { filename: 'app.js' });

  const fireAll = (map: Map<string, Listener[]>, type: string, e: StubEvent): void => { for (const fn of map.get(type) ?? []) fn(e); };
  if (!docListeners.has('DOMContentLoaded')) throw new Error('app.js did not wait for DOMContentLoaded');
  fireAll(docListeners, 'DOMContentLoaded', event('DOMContentLoaded'));
  // loadData: the fetch, its json() and the drawing settle in a few turns of the event loop.
  for (let i = 0; i < 5; i++) { await Promise.all(pending); await new Promise((r) => setImmediate(r)); }

  const sha = (x: unknown): string => createHash('sha256').update(JSON.stringify(x)).digest('hex');
  const lastFrame = (): Frame => {
    let start = -1;
    for (let i = canvas.log.length - 1; i >= 0; i--) if (canvas.log[i]?.[0] === 'clearRect') { start = i; break; }
    const calls = start < 0 ? [] : canvas.log.slice(start);
    let stars = 0; let fillStyle: unknown = '';
    const labels: string[] = [];
    for (const c of calls) {
      if (c[0] === 'fillStyle=') fillStyle = c[1];
      if (c[0] === 'fill' && typeof fillStyle === 'string' && fillStyle.startsWith('rgba(255, 255, 255,')) stars++;
      if (c[0] === 'fillText') labels.push(String(c[1]));
    }
    return { calls: calls.length, sha256: sha(calls), stars, labels };
  };
  const field = (input: StubElement, error: StubElement): PageState['lat'] =>
    ({ value: input.value, invalid: input.getAttribute('aria-invalid'), error: error.textContent, errorHidden: error.hidden });
  const button = (b: StubElement): string => `${[...b.classes].join(' ')}|${b.getAttribute('aria-selected')}`;
  const tooltip = byId('star-tooltip');

  return {
    state: () => ({
      tabs: { city: button(tabCity), gps: button(tabGps), cityPanelHidden: byId('panel-city').hidden, gpsPanelHidden: byId('panel-gps').hidden },
      search: { value: search.value, expanded: search.getAttribute('aria-expanded') },
      dropdown: {
        hidden: dropdown.hidden,
        rows: dropdown.children.map((li) => `${li.dataset['index']}|${li.children.map((s) => s.textContent).join('|')}|${[...li.classes].join(' ')}|${li.getAttribute('aria-selected')}`),
      },
      badge: { hidden: byId('city-selected').hidden, text: byId('city-selected-text').textContent },
      lat: field(lat, byId('lat-error')),
      lon: field(lon, byId('lon-error')),
      echo: { text: byId('gps-echo').textContent, hidden: byId('gps-echo').hidden },
      date: byId('date-input').value,
      live: { classes: [...byId('live-btn').classes].join(' '), text: byId('live-text').textContent, pending: frames.size },
      map: { hidden: byId('map-section').hidden, width: canvas.width, height: canvas.height },
      tooltip: { hidden: tooltip.hidden, text: tooltip.textContent, left: tooltip.style['left'] ?? '', top: tooltip.style['top'] ?? '' },
      focus: page.focus,
      frame: lastFrame(),
    }),
    totals: () => ({ calls: canvas.log.length, sha256: sha(canvas.log), console: [...consoleLines], fetched: [...fetched], fontLoads: [...fontLoads] }),
    typeCity: (text) => { search.value = text; search.fire('input'); },
    key: (key) => search.fire('keydown', { key }).defaultPrevented,
    clickRow: (i) => { const li = dropdown.children[i]; if (!li) throw new Error(`no row ${i}`); const e = li.fire('click'); fireAll(docListeners, 'click', e); },
    hoverRow: (i) => { const li = dropdown.children[i]; if (!li) throw new Error(`no row ${i}`); li.fire('mouseenter'); },
    click: (id) => { const e = byId(id).fire('click'); fireAll(docListeners, 'click', e); },
    clickOutside: () => { fireAll(docListeners, 'click', event('click', { target: pageBox })); },
    typeCoord: (which, text) => { const e = which === 'lat' ? lat : lon; e.value = text; e.fire('input'); },
    setDate: (value) => { byId('date-input').value = value; },
    frame: (at) => {
      clock = at;
      const [id, fn] = [...frames][0] ?? [];
      if (id !== undefined && fn) { frames.delete(id); fn(); }
    },
    hover: (x, y) => { canvas.fire('mousemove', { clientX: x, clientY: y }); },
    tooltip: () => ({ hidden: tooltip.hidden, text: tooltip.textContent, left: tooltip.style['left'] ?? '', top: tooltip.style['top'] ?? '' }),
    leave: () => { canvas.fire('mouseout'); },
    resize: () => { fireAll(winListeners, 'resize', event('resize')); },
  };
}
