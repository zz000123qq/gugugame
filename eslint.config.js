import js from '@eslint/js';

// ESLint 扁平配置（ESLint v9）
// 目标：在不改动任何文件扩展名/不重命名的前提下，清理风格与技术债。
// - js.configs.recommended：捕获未定义变量、重复声明等真实错误
// - 浏览器全局：游戏在浏览器运行，需声明 window/document/localStorage 等
// - no-unused-vars 仅告警（参数不查、下划线前缀变量忽略），避免噪音
export default [
  {
    ignores: [
      'dist/**',
      'test/.smoke-dist/**',
      'node_modules/**',
      'test/_ai_backup/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        Math: 'readonly',
        Date: 'readonly',
        JSON: 'readonly',
        performance: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        HTMLElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        WebGLRenderingContext: 'readonly',
        devicePixelRatio: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        Image: 'readonly',
        self: 'readonly',
        location: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
