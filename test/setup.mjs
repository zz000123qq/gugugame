// 在导入游戏模块之前，把浏览器全局对象 mock 成 Node 可运行的最小实现
function makeClassList() {
  const s = new Set();
  return {
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    contains: (c) => s.has(c),
    toggle: (c) => (s.has(c) ? s.delete(c) : s.add(c)),
  };
}

function makeCanvas() {
  return {
    width: 0, height: 0, style: {},
    addEventListener() {},
    getContext(type) {
      if (type === '2d') {
        return new Proxy({}, {
          get(t, p) {
            if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
            if (p === 'measureText') return () => ({ width: 10 });
            if (p in t) return t[p];
            return () => {};
          },
          set(t, p, v) { t[p] = v; return true; },
        });
      }
      return null;
    },
  };
}

function makeEl() {
  const listeners = {};
  return {
    classList: makeClassList(),
    style: {}, textContent: '', innerHTML: '', value: '',
    offsetWidth: 0,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener() {},
    appendChild() {}, removeChild() {}, remove() {},
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },  // 返回空数组（冒烟测试不需要真实 DOM）
    _fire(t, ev) { (listeners[t] || []).forEach((fn) => fn(ev || {})); },
  };
}

const elements = {};
const getEl = (id) => (elements[id] || (elements[id] = makeEl()));

let frames = 0;
const MAX_FRAMES = 200;
const tick = (cb) => {
  if (frames < MAX_FRAMES) { frames++; setTimeout(() => cb(performance.now()), 0); }
};

globalThis.window = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: tick,
};
globalThis.document = {
  getElementById: (id) => getEl(id),
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : makeEl()),
  createElementNS: (_ns, tag) => (tag === 'canvas' ? makeCanvas() : makeEl()),
  querySelector: (sel) => getEl(sel),
  body: makeEl(),
};
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
};
globalThis.requestAnimationFrame = tick;
globalThis.__frames = 0;
globalThis.__getFrames = () => frames;

export {};
