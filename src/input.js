// ============================================================ 输入
import { renderer, squad } from './core/context.js';
import { SQUAD_X_LIMIT } from './config.js';

export const keys = {};
let dragging = false, lastPX = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastPX = e.clientX; });
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastPX;
  lastPX = e.clientX;
  squad.targetX = Math.min(SQUAD_X_LIMIT, Math.max(-SQUAD_X_LIMIT, squad.targetX + dx * 0.02));
});
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ============================================================ 移动端虚拟摇杆（触屏时由 CSS 显示）
(function setupJoystick() {
  const joyBase = document.getElementById('joyBase');
  const joyKnob = document.getElementById('joyKnob');
  if (!joyBase || !joyKnob) return;
  const JOY_R = 46; // 旋钮最大横向位移
  let active = false, id = null, cx = 0, cy = 0, lastX = 0;
  const onDown = (e) => {
    active = true; id = e.pointerId;
    const r = joyBase.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    lastX = e.clientX;
    if (joyBase.setPointerCapture) { try { joyBase.setPointerCapture(id); } catch (_) {} }
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!active || e.pointerId !== id) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    squad.targetX = Math.min(SQUAD_X_LIMIT, Math.max(-SQUAD_X_LIMIT, squad.targetX + dx * 0.02));
    const kx = Math.max(-JOY_R, Math.min(JOY_R, e.clientX - cx));
    joyKnob.style.transform = `translate(${kx}px, 0px)`;
  };
  const onUp = (e) => {
    if (e.pointerId !== id) return;
    active = false;
    joyKnob.style.transform = 'translate(0px, 0px)';
  };
  joyBase.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
})();
