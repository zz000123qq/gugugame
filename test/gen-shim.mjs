// 生成 test/three-shim.mjs：把 three 的所有具名导出透传出来，仅用假的 WebGLRenderer 覆盖。
// 这样既能让无 GL 的 Node 跑通，又不会因 `export *` 导致覆盖项被 tree-shake。
import * as THREE from 'three';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const keys = Object.keys(THREE).filter((k) => k !== 'WebGLRenderer');
const shimPath = join(dirname(fileURLToPath(import.meta.url)), 'three-shim.mjs');

const body = `// 自动生成（test/gen-shim.mjs）。把 three 的全部具名导出透传，仅覆盖 WebGLRenderer。
import {
${keys.map((k) => '  ' + k).join(',\n')},
} from 'three';

function makeCanvas() {
  const c = {
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
  return c;
}

// 不依赖 GL 上下文的假渲染器：render() 为空操作。
class FakeWebGLRenderer {
  constructor() {
    this.domElement = makeCanvas();
    this.shadowMap = { enabled: false, type: 0 };
    this.outputColorSpace = '';
  }
  setPixelRatio() {}
  setSize() {}
  setClearColor() {}
  render() {}
  dispose() {}
}

export {
${keys.map((k) => '  ' + k).join(',\n')},
};
export { FakeWebGLRenderer as WebGLRenderer };
export { makeCanvas };
`;

writeFileSync(shimPath, body);
console.log(`wrote ${shimPath} (${keys.length} exports + WebGLRenderer)`);
