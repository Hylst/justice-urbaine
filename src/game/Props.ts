import type { PickupType } from './constants';

export type PropKind = 'barrel' | 'crate' | 'lamp';

export interface Prop {
  x: number;
  y: number;
  kind: PropKind;
  hp: number;
  maxHp: number;
  shake: number;
  destroyed: boolean;
  deathTimer: number;
  contents: PickupType | null;
  hitFlash: number;
  facing: 1 | -1;
}

export function createProp(kind: PropKind, x: number, y: number, contents: PickupType | null = null): Prop {
  const hp = kind === 'crate' ? 35 : kind === 'barrel' ? 25 : 999;
  return {
    x, y, kind, hp, maxHp: hp,
    shake: 0, destroyed: false, deathTimer: 0,
    contents, hitFlash: 0,
    facing: Math.random() < 0.5 ? 1 : -1,
  };
}

export function updateProps(props: Prop[], dt: number): Prop[] {
  for (const p of props) {
    if (p.shake > 0) p.shake = Math.max(0, p.shake - dt);
    if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
    if (p.destroyed) p.deathTimer = Math.max(0, p.deathTimer - dt);
  }
  return props.filter(p => !p.destroyed || p.deathTimer > 0);
}

export function drawProp(ctx: CanvasRenderingContext2D, p: Prop, scale: number) {
  if (p.destroyed && p.deathTimer <= 0) return;
  const s = scale;
  const shakeX = p.shake > 0 ? (Math.random() - 0.5) * 3 : 0;
  ctx.save();
  ctx.translate(p.x + shakeX, p.y);

  // Ground shadow
  if (!p.destroyed) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 26 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.scale(p.facing, 1);

  if (p.destroyed) {
    ctx.globalAlpha = p.deathTimer / 400;
    ctx.rotate((1 - p.deathTimer / 400) * Math.PI * 0.6);
    ctx.translate(0, (1 - p.deathTimer / 400) * 10);
  }

  const flash = p.hitFlash / 200;

  if (p.kind === 'barrel') {
    drawBarrel(ctx, s, flash);
  } else if (p.kind === 'crate') {
    drawCrate(ctx, s, flash);
  }

  ctx.restore();
}

function drawBarrel(ctx: CanvasRenderingContext2D, s: number, flash: number) {
  const w = 32 * s, h = 50 * s;
  // Body
  const grad = ctx.createLinearGradient(-w/2, 0, w/2, 0);
  grad.addColorStop(0, flash > 0 ? '#fff' : '#4a3520');
  grad.addColorStop(0.4, flash > 0 ? '#fff' : '#7a5a35');
  grad.addColorStop(1, flash > 0 ? '#fff' : '#3a2810');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#1a1208';
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Slightly tapered top/bottom
  ctx.moveTo(-w/2, -h);
  ctx.lineTo(w/2, -h);
  ctx.lineTo(w/2 + 2, -h * 0.5);
  ctx.lineTo(w/2, 0);
  ctx.lineTo(-w/2, 0);
  ctx.lineTo(-w/2 - 2, -h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Bands
  ctx.strokeStyle = '#1a0e04';
  ctx.lineWidth = 2.5;
  for (const yt of [-h * 0.2, -h * 0.5, -h * 0.8]) {
    ctx.beginPath();
    ctx.moveTo(-w/2 - 1, yt);
    ctx.lineTo(w/2 + 1, yt);
    ctx.stroke();
  }
  // Top rim
  ctx.fillStyle = '#1a0e04';
  ctx.fillRect(-w/2, -h - 2, w, 3);
  // Hazard sticker
  ctx.fillStyle = '#ffd23b';
  ctx.font = `bold ${Math.round(10 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('☣', 0, -h * 0.45);
  ctx.textAlign = 'left';
}

function drawCrate(ctx: CanvasRenderingContext2D, s: number, flash: number) {
  const w = 38 * s, h = 38 * s;
  const grad = ctx.createLinearGradient(0, -h, 0, 0);
  grad.addColorStop(0, flash > 0 ? '#fff' : '#a87a3a');
  grad.addColorStop(1, flash > 0 ? '#fff' : '#5a3a18');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#2a1808';
  ctx.lineWidth = 2;
  ctx.fillRect(-w/2, -h, w, h);
  ctx.strokeRect(-w/2, -h, w, h);
  // Plank lines
  ctx.strokeStyle = '#3a200a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-w/2, -h * 0.5);
  ctx.lineTo(w/2, -h * 0.5);
  ctx.moveTo(-w * 0.15, -h);
  ctx.lineTo(-w * 0.15, 0);
  ctx.moveTo(w * 0.15, -h);
  ctx.lineTo(w * 0.15, 0);
  ctx.stroke();
  // Stencil
  ctx.fillStyle = '#ffd23b';
  ctx.font = `bold ${Math.round(11 * s)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('CARGO', 0, -h * 0.45);
  ctx.textAlign = 'left';
}
