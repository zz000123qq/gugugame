import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// 仅把"应用代码"对 'three' 的导入重定向到 shim；shim 自身对 'three' 的导入保持指向真实 three，避免循环
function threeShim() {
  return {
    name: 'three-shim',
    enforce: 'pre', // 必须在 Vite 内置解析器之前运行，否则 'three' 会被直接解析到 node_modules 而跳过重定向
    resolveId(source, importer) {
      if (source === 'three' && importer && !importer.includes('three-shim')) {
        return path.resolve(root, 'test/three-shim.mjs');
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [threeShim()],
  // SSR 默认会把 'three' 外置（运行时从 node_modules 直接 require），导致 shim 重定向失效。
  // 这里强制把 three 打进 bundle，redirect 才能真正把应用代码引导到 fake WebGLRenderer。
  ssr: { noExternal: true },
  build: {
    ssr: path.resolve(root, 'test/smoke-entry.mjs'),
    // 输出到全新目录，避免 safe-delete shim 在清理旧产物时因回收站权限失败（F: 盘不支持 trash）
    outDir: path.resolve(root, 'test/.smoke-dist'),
    emptyOutDir: false,
    rollupOptions: {
      output: { format: 'es' },
    },
  },
});
