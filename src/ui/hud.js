// ============================================================ UI / HUD
import * as THREE from 'three';
import { camera, squad, state, ui, bosses, _proj } from '../core/context.js';

export function showBanner(text, color) {
  ui.banner.textContent = text;
  ui.banner.style.color = color || '';
  ui.banner.classList.remove('show');
  void ui.banner.offsetWidth;
  ui.banner.classList.add('show');
}

export function floatText(worldPos, text, good) {
  const v = worldPos.clone().project(camera);
  const el = document.createElement('div');
  el.className = `floatText ${good ? 'good' : 'bad'}`;
  el.textContent = text;
  el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  ui.hud.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

export function updateHud() {
  _proj.set(squad.x, 2.6, squad.z).project(camera);
  ui.countBadge.style.left = `${(_proj.x * 0.5 + 0.5) * window.innerWidth}px`;
  ui.countBadge.style.top = `${(-_proj.y * 0.5 + 0.5) * window.innerHeight}px`;
  ui.countBadge.textContent = state.count;

  ui.levelTag.textContent = `${Math.floor(state.dist)}m`;
  // 进度条 = 距下一个 Boss
  const span = state.nextBossAt - state.lastBossAt;
  ui.progressFill.style.width = `${Math.min(100, ((state.dist - state.lastBossAt) / span) * 100).toFixed(1)}%`;

  let html = '';
  if (state.rageTime > 0) html += `<div class="buffChip">🔥 狂暴 ${state.rageTime.toFixed(0)}s</div>`;
  if (state.shieldTime > 0) html += `<div class="buffChip">🛡️ 护盾 ${state.shieldTime.toFixed(0)}s</div>`;
  if (state.freezeTime > 0) html += `<div class="buffChip">❄️ 冰冻 ${state.freezeTime.toFixed(0)}s</div>`;
  ui.buffRow.innerHTML = html;

  if (bosses.length > 0) {
    const b = bosses[0];
    ui.bossbar.classList.add('visible');
    ui.bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100).toFixed(1)}%`;
  } else {
    ui.bossbar.classList.remove('visible');
  }
}
