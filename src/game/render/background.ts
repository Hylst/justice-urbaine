import type { ThemeColors } from '../constants';
import { CANVAS_WIDTH, CANVAS_HEIGHT, GROUND_Y_MIN, GROUND_Y_MAX } from '../constants';

export interface BgState {
  scroll: number;
  buildingsFar: { x: number; w: number; h: number; seed: number }[];
  buildingsNear: { x: number; w: number; h: number; seed: number }[];
  stars: { x: number; y: number; r: number; tw: number }[];
  weather: { x: number; y: number; vx: number; vy: number; life: number }[];
  neonSigns: { x: number; y: number; w: number; color: string; seed: number }[];
  lampposts: { x: number; seed: number }[];
  pedestrians: { x: number; baseY: number; speed: number; phase: number; size: number; tint: number }[];
}

export function createBgState(): BgState {
  const buildingsFar: BgState['buildingsFar'] = [];
  const buildingsNear: BgState['buildingsNear'] = [];
  let fx = -40;
  let seed = 1;
  while (fx < CANVAS_WIDTH + 80) {
    const w = 50 + ((seed * 37) % 60);
    const h = 70 + ((seed * 53) % 90);
    buildingsFar.push({ x: fx, w, h, seed });
    fx += w + 6;
    seed = (seed * 9301 + 49297) % 233280;
  }
  let nx = -30;
  let seed2 = 7;
  while (nx < CANVAS_WIDTH + 100) {
    const w = 80 + ((seed2 * 41) % 90);
    const h = 120 + ((seed2 * 67) % 140);
    buildingsNear.push({ x: nx, w, h, seed: seed2 });
    nx += w + 10;
    seed2 = (seed2 * 9301 + 49297) % 233280;
  }
  const stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * (GROUND_Y_MIN - 40),
    r: Math.random() * 1.4 + 0.3,
    tw: Math.random() * Math.PI * 2,
  }));
  // Lampposts for extra detail
  const lampposts: BgState['lampposts'] = [];
  for (let i = 0; i < 8; i++) {
    lampposts.push({ x: i * (CANVAS_WIDTH / 8) + 40, seed: i * 17 + 3 });
  }
  // Background pedestrians (silhouettes walking along the far sidewalk)
  const pedestrians: BgState['pedestrians'] = [];
  for (let i = 0; i < 6; i++) {
    pedestrians.push({
      x: Math.random() * CANVAS_WIDTH,
      baseY: GROUND_Y_MIN - 6 - Math.random() * 4,
      speed: (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.25),
      phase: Math.random() * Math.PI * 2,
      size: 0.55 + Math.random() * 0.2,
      tint: Math.random(),
    });
  }
  return {
    scroll: 0, buildingsFar, buildingsNear, stars,
    weather: [], neonSigns: [], lampposts, pedestrians,
  };
}

export function updateBgState(bg: BgState, dt: number, theme: ThemeColors) {
  bg.scroll += dt * 0.04;
  for (const s of bg.stars) s.tw += dt * 0.003;
  // Pedestrians shuffle across the far sidewalk
  for (const p of bg.pedestrians) {
    p.x += p.speed * dt * 0.06;
    p.phase += dt * 0.012 * Math.abs(p.speed) * 8;
    if (p.x < -30) p.x = CANVAS_WIDTH + 30;
    if (p.x > CANVAS_WIDTH + 30) p.x = -30;
  }
  if (theme.weather !== 'clear') {
    if (bg.weather.length < 180 && Math.random() < 0.6) {
      bg.weather.push({
        x: Math.random() * CANVAS_WIDTH,
        y: -10,
        vx: theme.weather === 'embers' ? -0.3 : -1.6,
        vy: theme.weather === 'rain' ? 7 : theme.weather === 'snow' ? 1.2 : -0.8,
        life: 0,
      });
    }
    for (let i = bg.weather.length - 1; i >= 0; i--) {
      const p = bg.weather[i];
      p.x += p.vx; p.y += p.vy; p.life += dt * 0.001;
      if (p.y > GROUND_Y_MAX || p.x < -20 || p.life > 4) bg.weather.splice(i, 1);
    }
  }
}

export function drawBackground(
  ctx: CanvasRenderingContext2D, theme: ThemeColors, bg: BgState, time: number
) {
  // Sky gradient with slight animated variation
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y_MIN);
  sky.addColorStop(0, theme.skyTop);
  sky.addColorStop(0.5, theme.skyBottom);
  sky.addColorStop(1, mixHex(theme.skyBottom, theme.accent, 0.05));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND_Y_MIN);

  // Stars
  if (theme.weather !== 'embers') {
    for (const s of bg.stars) {
      const a = 0.4 + Math.sin(s.tw) * 0.4;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Moon
  const moonG = ctx.createRadialGradient(820, 80, 5, 820, 80, 80);
  moonG.addColorStop(0, theme.windowB);
  moonG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = moonG;
  ctx.fillRect(700, 0, 240, 170);
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.windowB;
  ctx.beginPath();
  ctx.arc(820, 80, 28, 0, Math.PI * 2);
  ctx.fill();

  // Far skyline
  drawSkyline(ctx, bg.buildingsFar, theme.buildingFar, theme, bg.scroll * 0.25, GROUND_Y_MIN, 0.5);
  // Near skyline with windows
  drawSkyline(ctx, bg.buildingsNear, theme.buildingNear, theme, bg.scroll * 0.6, GROUND_Y_MIN, 1, true);

  // Neon signs on near buildings (only if defined)
  if (theme.neonSigns) {
    for (const sign of theme.neonSigns) {
      drawNeonSign(ctx, sign, theme, bg.scroll * 0.6, time);
    }
  }

  // Background pedestrians (silhouettes)
  drawPedestrians(ctx, bg, theme);

  // Fog band
  const fog = ctx.createLinearGradient(0, GROUND_Y_MIN - 60, 0, GROUND_Y_MIN + 20);
  fog.addColorStop(0, 'rgba(0,0,0,0)');
  fog.addColorStop(1, theme.fog);
  ctx.fillStyle = fog;
  ctx.fillRect(0, GROUND_Y_MIN - 60, CANVAS_WIDTH, 80);

  // Ground
  const ground = ctx.createLinearGradient(0, GROUND_Y_MIN, 0, GROUND_Y_MAX + 40);
  ground.addColorStop(0, theme.groundTop);
  ground.addColorStop(1, theme.groundBottom);
  ctx.fillStyle = ground;
  ctx.fillRect(0, GROUND_Y_MIN, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y_MIN);

  // Perspective grid
  drawGrid(ctx, theme, bg.scroll);

  // Lampposts
  drawLampposts(ctx, bg, theme, time);

  // Horizon neon line
  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2;
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y_MIN);
  ctx.lineTo(CANVAS_WIDTH, GROUND_Y_MIN);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // Weather
  drawWeather(ctx, theme, bg);

  // Vignette
  const vg = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 200, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 640);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  void time;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

function drawPedestrians(ctx: CanvasRenderingContext2D, bg: BgState, theme: ThemeColors) {
  ctx.save();
  for (const p of bg.pedestrians) {
    const s = p.size;
    const stride = Math.sin(p.phase) * 4 * s;
    const lift = Math.abs(Math.sin(p.phase * 2)) * 1.5 * s;
    const facing = p.speed > 0 ? 1 : -1;
    ctx.save();
    ctx.translate(p.x, p.baseY);
    ctx.scale(facing, 1);
    // Backlit silhouette tinted with theme accent
    const tintColor = p.tint < 0.33 ? theme.windowA : p.tint < 0.66 ? theme.windowB : theme.accent;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#0a0a16';
    // Body
    ctx.fillRect(-3 * s, -16 * s, 6 * s, 12 * s);
    // Head
    ctx.beginPath();
    ctx.arc(0, -19 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
    // Legs (animated)
    ctx.fillRect(-3 * s, -4 * s, 2.4 * s, 5 * s + lift);
    ctx.fillRect(0.6 * s, -4 * s, 2.4 * s, 5 * s - lift);
    // Arms
    ctx.fillRect(-5 * s - stride * 0.4, -15 * s, 2 * s, 8 * s);
    ctx.fillRect(3 * s + stride * 0.4, -15 * s, 2 * s, 8 * s);
    // Tiny rim highlight from neon
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = tintColor;
    ctx.fillRect(-3 * s, -16 * s, 1 * s, 12 * s);
    ctx.restore();
  }
  ctx.restore();
}

function drawSkyline(
  ctx: CanvasRenderingContext2D, buildings: BgState['buildingsFar'], color: string,
  theme: ThemeColors, scroll: number, baseY: number, alpha: number, withWindows = false
) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const span = buildings[buildings.length - 1].x + buildings[buildings.length - 1].w + 10;
  for (let pass = -1; pass <= 1; pass++) {
    for (const b of buildings) {
      let x = b.x + pass * span - (scroll % span);
      if (x > CANVAS_WIDTH + 10 || x + b.w < -10) continue;
      const top = baseY - b.h;
      // Building body
      ctx.fillRect(x, top, b.w, b.h);
      // Roof edge
      ctx.fillStyle = mixHex(color, '#000000', 0.3);
      ctx.fillRect(x, top, b.w, 3);
      ctx.fillStyle = color;
      // Antenna on tall buildings
      if (b.h > 140 && b.seed % 3 === 0) {
        ctx.fillRect(x + b.w / 2 - 1, top - 20, 2, 20);
      }
      if (withWindows) {
        drawWindows(ctx, x, top, b.w, b.h, b.seed, theme, scroll);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawWindows(
  ctx: CanvasRenderingContext2D, x: number, top: number, w: number, h: number,
  seed: number, theme: ThemeColors, scroll: number
) {
  const cols = Math.max(2, Math.floor(w / 16));
  const rows = Math.max(3, Math.floor(h / 18));
  const padX = (w - cols * 8) / (cols + 1);
  const padY = (h - rows * 10) / (rows + 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sd = (seed + r * 13 + c * 7) % 100;
      if (sd < 40) continue;
      const flicker = (Math.sin((scroll + r * 2 + c) * 0.5) > 0.92) ? 0.2 : 1;
      ctx.globalAlpha = 0.88 * flicker;
      ctx.fillStyle = sd % 3 === 0 ? theme.windowA : theme.windowB;
      const wx = x + padX + c * (8 + padX);
      const wy = top + padY + r * (10 + padY);
      ctx.fillRect(wx, wy, 6, 8);
      // Glow
      ctx.shadowColor = ctx.fillStyle as string;
      ctx.shadowBlur = 3;
      ctx.fillRect(wx, wy, 6, 8);
      ctx.shadowBlur = 0;
    }
  }
  ctx.globalAlpha = 1;
}

function drawNeonSign(ctx: CanvasRenderingContext2D, sign: { x: number; y: number; text: string; color: string }, _theme: ThemeColors, scroll: number, time: number) {
  const sx = sign.x - (scroll % (CANVAS_WIDTH * 0.3));
  if (sx < -100 || sx > CANVAS_WIDTH + 100) return;
  const flicker = (Math.sin(time * 0.008 + sign.x) > 0.2) ? 1 : 0.3;
  ctx.save();
  ctx.globalAlpha = flicker;
  ctx.font = 'bold 22px "Courier New", monospace';
  ctx.fillStyle = sign.color;
  ctx.shadowColor = sign.color;
  ctx.shadowBlur = 16;
  ctx.textAlign = 'center';
  ctx.fillText(sign.text, sx, sign.y);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, theme: ThemeColors, scroll: number) {
  const vx = CANVAS_WIDTH / 2;
  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = 1;
  const lines = 14;
  for (let i = 0; i <= lines; i++) {
    const t = i / lines;
    const y = GROUND_Y_MIN + Math.pow(t, 1.6) * (GROUND_Y_MAX - GROUND_Y_MIN + 30);
    ctx.globalAlpha = 0.12 + t * 0.45;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.4;
  const count = 18;
  const sScroll = (scroll * 14) % (CANVAS_WIDTH / count);
  for (let i = -1; i <= count + 1; i++) {
    const xb = (i / count) * CANVAS_WIDTH - sScroll;
    ctx.beginPath();
    ctx.moveTo(vx + (xb - vx) * 0.25, GROUND_Y_MIN);
    ctx.lineTo(xb, GROUND_Y_MAX + 40);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawLampposts(ctx: CanvasRenderingContext2D, bg: BgState, theme: ThemeColors, time: number) {
  const scroll = bg.scroll * 0.3;
  ctx.save();
  for (const lp of bg.lampposts) {
    const x = ((lp.x - scroll) % (CANVAS_WIDTH + 80) + CANVAS_WIDTH + 80) % (CANVAS_WIDTH + 80) - 40;
    const baseY = GROUND_Y_MIN + 40;
    // Post
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x - 2, baseY - 100, 4, 100);
    // Arm
    ctx.fillRect(x, baseY - 100, 20, 3);
    // Lamp
    ctx.fillStyle = theme.accent;
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x + 20, baseY - 97, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Light cone
    const lg = ctx.createRadialGradient(x + 20, baseY - 97, 0, x + 20, baseY - 97, 50);
    lg.addColorStop(0, theme.accent);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(x + 20, baseY - 97, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  void time;
}

function drawWeather(ctx: CanvasRenderingContext2D, theme: ThemeColors, bg: BgState) {
  if (theme.weather === 'rain') {
    ctx.strokeStyle = 'rgba(150,180,255,0.45)';
    ctx.lineWidth = 1.3;
    for (const p of bg.weather) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 3, p.y + 10);
      ctx.stroke();
    }
  } else if (theme.weather === 'snow') {
    ctx.fillStyle = 'rgba(220,235,255,0.75)';
    for (const p of bg.weather) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (theme.weather === 'embers') {
    for (const p of bg.weather) {
      ctx.globalAlpha = Math.max(0, 1 - p.life);
      ctx.fillStyle = theme.windowA;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
