import type { Palette, EnemyBuild } from '../constants';

export type AttackPhase = 'none' | 'windup' | 'strike' | 'recover';

export interface PoseState {
  walkPhase: number;
  moving: boolean;
  attackPhase: AttackPhase;
  attackProgress: number;
  attackKind: 'light' | 'heavy' | 'special' | 'uppercut' | 'shoot' | 'grenade' | 'none';
  hurt: boolean;
  hurtAmt: number;
  dead: boolean;
  deathProgress: number;
  lean: number;
  invuln: boolean;
  blink: number;
}

interface Pt { x: number; y: number; }

function ik(a: Pt, target: Pt, l1: number, l2: number, bend: number): Pt {
  const dx = target.x - a.x;
  const dy = target.y - a.y;
  let d = Math.hypot(dx, dy);
  const minD = Math.abs(l1 - l2) + 0.01;
  const maxD = l1 + l2 - 0.01;
  d = Math.max(minD, Math.min(d, maxD));
  const base = Math.atan2(dy, dx);
  const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + bend * Math.acos(Math.max(-1, Math.min(1, c)));
  return { x: a.x + Math.cos(ang) * l1, y: a.y + Math.sin(ang) * l1 };
}

function hexLerp(hex: string, toward: string, t: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

interface BuildMetrics {
  shoulderW: number;
  hipW: number;
  thigh: number;
  shin: number;
  upperArm: number;
  foreArm: number;
  reach: number;
  headR: number;
  bodyH: number;
}

function buildMetrics(build: EnemyBuild | 'player', sizeMult: number): BuildMetrics {
  const s = sizeMult;
  if (build === 'brute') {
    return { shoulderW: 22*s, hipW: 17*s, thigh: 32*s, shin: 30*s, upperArm: 22*s, foreArm: 24*s, reach: 56*s, headR: 13*s, bodyH: 38*s };
  }
  if (build === 'boss') {
    return { shoulderW: 30*s, hipW: 24*s, thigh: 40*s, shin: 36*s, upperArm: 30*s, foreArm: 32*s, reach: 72*s, headR: 18*s, bodyH: 52*s };
  }
  if (build === 'runner') {
    return { shoulderW: 14*s, hipW: 11*s, thigh: 30*s, shin: 30*s, upperArm: 19*s, foreArm: 20*s, reach: 50*s, headR: 10.5*s, bodyH: 32*s };
  }
  if (build === 'archer' || build === 'sniper' || build === 'thrower') {
    return { shoulderW: 16*s, hipW: 12*s, thigh: 30*s, shin: 30*s, upperArm: 19*s, foreArm: 20*s, reach: 54*s, headR: 11*s, bodyH: 34*s };
  }
  return { shoulderW: 17*s, hipW: 13*s, thigh: 31*s, shin: 31*s, upperArm: 20*s, foreArm: 22*s, reach: 54*s, headR: 12*s, bodyH: 34*s };
}

function limb(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, width: number, color: string, dark: string) {
  ctx.lineCap = 'round';
  // Outline
  ctx.strokeStyle = dark;
  ctx.lineWidth = width + 2.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  // Inner bright
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  // Highlight stripe
  ctx.strokeStyle = hexLerp(color, '#ffffff', 0.35);
  ctx.lineWidth = width * 0.3;
  ctx.beginPath();
  ctx.moveTo(a.x + 0.5, a.y + 0.5);
  ctx.lineTo(b.x + 0.5, b.y + 0.5);
  ctx.stroke();
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number; y: number; scale: number; facing: 1 | -1;
    palette: Palette; build: EnemyBuild | 'player'; pose: PoseState;
  }
) {
  const { palette, pose } = opts;
  const m = buildMetrics(opts.build, opts.scale);
  const s = opts.scale;

  ctx.globalAlpha = pose.invuln ? pose.blink : 1;

  const flash = pose.hurtAmt;
  const body = flash > 0 ? hexLerp(palette.body, '#ffffff', flash) : palette.body;
  const bodyDark = flash > 0 ? hexLerp(palette.bodyDark, '#ffffff', flash) : palette.bodyDark;
  const limbC = flash > 0 ? hexLerp(palette.limb, '#ffffff', flash) : palette.limb;
  const limbD = flash > 0 ? hexLerp(palette.limbDark, '#ffffff', flash) : palette.limbDark;
  const accent = palette.accent;
  const glow = palette.glow ?? palette.accent;

  ctx.save();
  ctx.translate(opts.x, opts.y);

  // Shadow
  if (!pose.dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 32 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.scale(opts.facing, 1);

  if (pose.dead) {
    ctx.globalAlpha = Math.max(0, 1 - pose.deathProgress) * (pose.invuln ? pose.blink : 1);
    ctx.translate(0, -6 * s * pose.deathProgress);
    ctx.rotate((-Math.PI / 2) * pose.deathProgress);
  }

  ctx.rotate(pose.lean * 0.22);

  // === BREATHING / IDLE BOB ===
  // Subtle vertical breath when not moving; bouncier bob when walking
  const breath = pose.moving
    ? Math.abs(Math.sin(pose.walkPhase * 2)) * 2 * s          // big bob with steps
    : Math.sin(pose.walkPhase * 0.6) * 1.2 * s;               // gentle breathing
  const torsoTwist = pose.moving ? Math.sin(pose.walkPhase) * 0.05 : 0;

  // Hurt pose: cower slightly (head back, torso back)
  const hurtPush = pose.hurtAmt * -4 * s;

  // Skeleton anchors
  const hipY = -(m.thigh + m.shin) * 0.55 - 2 * s + breath * 0.4;
  const shoulderY = hipY - m.bodyH + breath * 0.3;
  const hip: Pt = { x: hurtPush * 0.5, y: hipY };
  const shoulder: Pt = { x: hurtPush, y: shoulderY };
  // Head bobs slightly counter to torso, plus breathing
  const headBob = pose.moving ? Math.sin(pose.walkPhase * 2 + 0.4) * 1 * s : Math.sin(pose.walkPhase * 0.6 + 0.3) * 0.6 * s;
  const headCenter: Pt = {
    x: hurtPush * 1.4 + (pose.attackPhase === 'windup' ? -2 * s : 0),
    y: shoulderY - m.headR - 4 * s + headBob,
  };

  // === LEGS ===
  // 4-phase walk cycle with proper lift, plant, push
  const swing = pose.moving ? 1 : 0.15;
  const legFootX = (i: number) => {
    const ph = pose.walkPhase + i * Math.PI;
    // Forward swing + backward push (uses raw sin); raise foot when going forward
    return Math.sin(ph) * 13 * s * swing + (i === 1 ? 3 * s : -3 * s);
  };
  const legFootY = (i: number) => {
    const ph = pose.walkPhase + i * Math.PI;
    // Lift only during forward half of cycle (more natural)
    const lift = Math.max(0, Math.sin(ph));
    // Add small "plant" dip at the end
    const plant = Math.max(0, -Math.sin(ph)) * -0.5;
    return -(lift * 9 * s + plant * s) * swing;
  };
  const footTargets = [0, 1].map((i) => ({ x: legFootX(i), y: legFootY(i) }));

  void torsoTwist;

  // Back leg
  drawLeg(ctx, hip, footTargets[0], m, limbD, bodyDark, s);
  // Back arm
  const backHand = backArmTarget(pose, m, s, 1);
  drawArm(ctx, shoulder, backHand, m, limbD, bodyDark, s, accent, pose, false);

  // === TORSO (with shading) ===
  // Body gradient
  const torsoGrad = ctx.createLinearGradient(0, shoulderY - 10 * s, 0, hipY + 2 * s);
  torsoGrad.addColorStop(0, body);
  torsoGrad.addColorStop(0.6, body);
  torsoGrad.addColorStop(1, bodyDark);
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = palette.trim;
  ctx.lineWidth = 2.2 * s;

  ctx.beginPath();
  ctx.moveTo(-m.shoulderW, shoulderY + 3 * s);
  ctx.quadraticCurveTo(-m.shoulderW * 1.15, shoulderY + 16 * s, -m.hipW, hipY + 2 * s);
  ctx.lineTo(m.hipW, hipY + 2 * s);
  ctx.quadraticCurveTo(m.shoulderW * 1.15, shoulderY + 16 * s, m.shoulderW, shoulderY + 3 * s);
  ctx.quadraticCurveTo(m.shoulderW, shoulderY - 6 * s, 0, shoulderY - 9 * s);
  ctx.quadraticCurveTo(-m.shoulderW, shoulderY - 6 * s, -m.shoulderW, shoulderY + 3 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Chest accent (emblem)
  const emblemGrad = ctx.createLinearGradient(0, shoulderY + 8 * s, 0, shoulderY + 18 * s);
  emblemGrad.addColorStop(0, accent);
  emblemGrad.addColorStop(1, hexLerp(accent, bodyDark, 0.5));
  ctx.fillStyle = emblemGrad;
  ctx.beginPath();
  ctx.moveTo(-m.shoulderW * 0.45, shoulderY + 9 * s);
  ctx.lineTo(m.shoulderW * 0.45, shoulderY + 9 * s);
  ctx.lineTo(m.shoulderW * 0.25, shoulderY + 18 * s);
  ctx.lineTo(-m.shoulderW * 0.25, shoulderY + 18 * s);
  ctx.closePath();
  ctx.fill();

  // Emblem icon for different builds
  ctx.fillStyle = palette.trim;
  ctx.font = `bold ${Math.round(10 * s)}px "Courier New"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const icon = buildIcon(opts.build);
  ctx.fillText(icon, 0, shoulderY + 13 * s);

  // Belt
  ctx.fillStyle = palette.trim;
  ctx.fillRect(-m.hipW, hipY - 3 * s, m.hipW * 2, 6 * s);
  ctx.fillStyle = accent;
  ctx.fillRect(-3 * s, hipY - 3 * s, 6 * s, 6 * s);
  // Belt highlight
  ctx.fillStyle = hexLerp(palette.trim, '#ffffff', 0.3);
  ctx.fillRect(-m.hipW, hipY - 3 * s, m.hipW * 2, 1.5 * s);

  // === HEAD (with shading) ===
  // Neck
  ctx.fillStyle = limbC;
  ctx.fillRect(-3 * s, headCenter.y + m.headR - 3 * s, 6 * s, 8 * s);
  // Head gradient
  const headGrad = ctx.createRadialGradient(
    headCenter.x - m.headR * 0.3, headCenter.y - m.headR * 0.3, 1,
    headCenter.x, headCenter.y, m.headR
  );
  headGrad.addColorStop(0, hexLerp(body, '#ffffff', 0.2));
  headGrad.addColorStop(1, bodyDark);
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = palette.trim;
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.arc(headCenter.x, headCenter.y, m.headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Visor/hair
  const visorGrad = ctx.createLinearGradient(headCenter.x, headCenter.y - m.headR, headCenter.x, headCenter.y);
  visorGrad.addColorStop(0, hexLerp(accent, '#ffffff', 0.2));
  visorGrad.addColorStop(1, accent);
  ctx.fillStyle = visorGrad;
  ctx.beginPath();
  ctx.arc(headCenter.x, headCenter.y - m.headR * 0.25, m.headR, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();

  // Eye glow (character-specific)
  ctx.fillStyle = glow;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 8 * s;
  ctx.fillRect(headCenter.x + m.headR * 0.15, headCenter.y - 1 * s, m.headR * 0.55, 2.6 * s);
  ctx.shadowBlur = 0;

  // === HEADGEAR (per-build distinct silhouette) ===
  drawHeadgear(ctx, opts.build, headCenter, m, s, palette);

  // === FRONT LEG ===
  drawLeg(ctx, hip, footTargets[1], m, limbC, body, s);
  // === FRONT ARM ===
  const frontHand = frontArmTarget(pose, m, s);
  drawArm(ctx, shoulder, frontHand, m, limbC, body, s, accent, pose, true);

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawHeadgear(
  ctx: CanvasRenderingContext2D,
  build: EnemyBuild | 'player',
  head: Pt, m: BuildMetrics, s: number, palette: Palette
) {
  const hx = head.x;
  const hy = head.y;
  const r = m.headR;

  if (build === 'player') {
    // Tactical headband with star
    ctx.fillStyle = palette.accent;
    ctx.fillRect(hx - r, hy - r * 0.05, r * 2, r * 0.22);
    ctx.fillStyle = palette.trim;
    ctx.font = `bold ${Math.round(r * 0.9)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', hx, hy);
    ctx.textAlign = 'left';
    return;
  }

  if (build === 'thug') {
    // Bandana tied at back with two tails
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.15, r * 1.02, Math.PI, Math.PI * 2);
    ctx.lineTo(hx + r, hy + r * 0.1);
    ctx.lineTo(hx - r, hy + r * 0.1);
    ctx.closePath();
    ctx.fill();
    // Tails fluttering back
    ctx.fillStyle = palette.bodyDark;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.9, hy + r * 0.05);
    ctx.lineTo(hx - r * 1.6, hy - r * 0.2);
    ctx.lineTo(hx - r * 1.5, hy + r * 0.1);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (build === 'runner') {
    // Backwards cap with brim
    ctx.fillStyle = palette.bodyDark;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.1, r * 1.05, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.accent;
    ctx.fillRect(hx - r * 1.1, hy - r * 0.1, r * 0.6, r * 0.18);
    return;
  }

  if (build === 'brute') {
    // Bulky helmet with bolts
    ctx.fillStyle = palette.limbDark;
    ctx.strokeStyle = palette.trim;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.1, r * 1.18, Math.PI * 0.95, Math.PI * 2.05);
    ctx.lineTo(hx + r * 1.1, hy + r * 0.3);
    ctx.lineTo(hx - r * 1.1, hy + r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Bolts
    ctx.fillStyle = palette.accent;
    for (const bx of [-r * 0.7, 0, r * 0.7]) {
      ctx.beginPath();
      ctx.arc(hx + bx, hy - r * 0.25, 1.6 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (build === 'archer') {
    // Hood with shadow over eyes
    ctx.fillStyle = palette.bodyDark;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.1, r * 1.25, Math.PI * 0.9, Math.PI * 2.1);
    ctx.lineTo(hx + r * 1.3, hy + r * 0.5);
    ctx.quadraticCurveTo(hx, hy + r * 0.4, hx - r * 1.3, hy + r * 0.5);
    ctx.closePath();
    ctx.fill();
    // Shadow band over eyes
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(hx - r * 0.9, hy - r * 0.15, r * 1.8, r * 0.45);
    return;
  }

  if (build === 'sniper') {
    // Wide-brim hat with band
    ctx.fillStyle = palette.bodyDark;
    // Brim
    ctx.beginPath();
    ctx.ellipse(hx, hy - r * 0.55, r * 1.55, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    // Crown
    ctx.fillRect(hx - r * 0.7, hy - r * 1.25, r * 1.4, r * 0.75);
    // Band
    ctx.fillStyle = palette.accent;
    ctx.fillRect(hx - r * 0.7, hy - r * 0.7, r * 1.4, r * 0.15);
    return;
  }

  if (build === 'thrower') {
    // Mohawk spike on top
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.6, hy - r * 0.8);
    ctx.lineTo(hx, hy - r * 1.6);
    ctx.lineTo(hx + r * 0.6, hy - r * 0.8);
    ctx.closePath();
    ctx.fill();
    // Side spikes
    for (const off of [-r * 0.3, r * 0.3]) {
      ctx.beginPath();
      ctx.moveTo(hx + off - r * 0.2, hy - r * 0.7);
      ctx.lineTo(hx + off, hy - r * 1.3);
      ctx.lineTo(hx + off + r * 0.2, hy - r * 0.7);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  if (build === 'boss') {
    // Crown with spikes + horn
    ctx.fillStyle = palette.accent;
    ctx.strokeStyle = palette.trim;
    ctx.lineWidth = 2 * s;
    // Crown base
    ctx.fillRect(hx - r * 1.1, hy - r * 0.85, r * 2.2, r * 0.35);
    ctx.strokeRect(hx - r * 1.1, hy - r * 0.85, r * 2.2, r * 0.35);
    // Spikes
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
      const bx = hx + i * r * 0.5;
      ctx.moveTo(bx - r * 0.18, hy - r * 0.85);
      ctx.lineTo(bx, hy - r * 1.55);
      ctx.lineTo(bx + r * 0.18, hy - r * 0.85);
    }
    ctx.closePath();
    ctx.fillStyle = palette.glow ?? palette.accent;
    ctx.fill();
    ctx.stroke();
    // Center gem
    ctx.fillStyle = '#ff3b5c';
    ctx.shadowColor = '#ff3b5c';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(hx, hy - r * 0.65, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    return;
  }
}

function buildIcon(build: EnemyBuild | 'player'): string {
  switch (build) {
    case 'player': return '★';
    case 'thug': return 'X';
    case 'runner': return '→';
    case 'brute': return '◆';
    case 'archer': return '⇨';
    case 'sniper': return '◎';
    case 'thrower': return '✦';
    case 'boss': return '☠';
    default: return '•';
  }
}

function drawLeg(ctx: CanvasRenderingContext2D, hip: Pt, foot: Pt, m: BuildMetrics, color: string, footColor: string, s: number) {
  const knee = ik(hip, foot, m.thigh, m.shin, -1);
  limb(ctx, hip, knee, 10 * s, color, color);
  limb(ctx, knee, foot, 8.5 * s, color, color);
  // Foot with shading
  ctx.fillStyle = footColor;
  ctx.strokeStyle = hexLerp(footColor, '#000000', 0.4);
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.ellipse(foot.x + 3 * s, foot.y, 7.5 * s, 4.2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Knee pad
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(knee.x, knee.y, 3.6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexLerp(color, '#ffffff', 0.3);
  ctx.beginPath();
  ctx.arc(knee.x - 0.8*s, knee.y - 0.8*s, 1.5 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawArm(ctx: CanvasRenderingContext2D, shoulder: Pt, hand: Pt, m: BuildMetrics, color: string, handColor: string, s: number, accent: string, pose: PoseState, isFront: boolean) {
  const elbow = ik(shoulder, hand, m.upperArm, m.foreArm, 1);
  limb(ctx, shoulder, elbow, 8.5 * s, color, color);
  limb(ctx, elbow, hand, 7 * s, color, color);
  // Shoulder pad
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(shoulder.x + (isFront ? 2 : -2) * s, shoulder.y + 3 * s, 4.8 * s, 0, Math.PI * 2);
  ctx.fill();
  // Fist with shading
  const fistR = isFront && pose.attackPhase === 'strike' ? 7 * s : 5.2 * s;
  const fistGrad = ctx.createRadialGradient(hand.x - 1.5*s, hand.y - 1.5*s, 0, hand.x, hand.y, fistR);
  fistGrad.addColorStop(0, hexLerp(handColor, '#ffffff', 0.25));
  fistGrad.addColorStop(1, handColor);
  ctx.fillStyle = fistGrad;
  ctx.beginPath();
  ctx.arc(hand.x, hand.y, fistR, 0, Math.PI * 2);
  ctx.fill();
  if (isFront && pose.attackPhase === 'strike') {
    // Accent ring on fist
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.arc(hand.x, hand.y, fistR * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function frontArmTarget(pose: PoseState, m: BuildMetrics, s: number): Pt {
  const baseY = -((m.thigh + m.shin) * 0.55 + 2 * s) - m.bodyH + 26 * s;

  // Special/uppercut: big swing motion
  if (pose.attackKind === 'uppercut') {
    if (pose.attackPhase === 'windup') {
      const p = pose.attackProgress;
      return { x: -8*s, y: baseY + p * 20 * s };
    }
    if (pose.attackPhase === 'strike') {
      const p = pose.attackProgress;
      return { x: 20*s + p * 30*s, y: baseY - 20*s - p * 40*s };
    }
    const p = pose.attackProgress;
    return { x: 50*s - p * 40*s, y: baseY - 60*s + 50*s };
  }

  if (pose.attackKind === 'special') {
    if (pose.attackPhase === 'windup') {
      const p = pose.attackProgress;
      return { x: -18*s, y: baseY - 18*s - p * 8*s };
    }
    if (pose.attackPhase === 'strike') {
      return { x: m.reach + 20*s, y: baseY - 12*s };
    }
    const p = pose.attackProgress;
    return { x: m.reach + 20*s - p * (m.reach + 10*s), y: baseY - 12*s + 10*s };
  }

  if (pose.attackKind === 'heavy') {
    if (pose.attackPhase === 'windup') {
      const p = pose.attackProgress;
      return { x: -12*s, y: baseY - 22*s + p * 2*s };
    }
    if (pose.attackPhase === 'strike') {
      return { x: m.reach, y: baseY - 10*s };
    }
    const p = pose.attackProgress;
    return { x: m.reach * (1-p) + 4*s*p, y: baseY - 10*s + 8*s*p };
  }

  if (pose.attackKind === 'shoot') {
    if (pose.attackPhase === 'windup') return { x: m.shoulderW * 0.5, y: baseY - 4*s };
    if (pose.attackPhase === 'strike') return { x: m.reach - 10*s, y: baseY - 6*s };
    return { x: 10*s, y: baseY };
  }

  // Overhead grenade throw: wind the arm back & up, then swing forward & release.
  if (pose.attackKind === 'grenade') {
    if (pose.attackPhase === 'windup') {
      const p = pose.attackProgress;
      // arm cocks behind the head
      return { x: -14*s + p * -6*s, y: baseY - 30*s - p * 18*s };
    }
    if (pose.attackPhase === 'strike') {
      const p = pose.attackProgress;
      // sharp forward swing, releasing at the top of the arc
      return { x: -20*s + p * (m.reach + 16*s), y: baseY - 48*s + p * 34*s };
    }
    const p = pose.attackProgress;
    // follow-through drops the arm
    return { x: m.reach + 4*s - p * 18*s, y: baseY - 14*s + p * 22*s };
  }

  // light / default attacks
  if (pose.attackPhase === 'none') {
    const ph = pose.walkPhase + Math.PI;
    return { x: Math.sin(ph) * 10 * s, y: baseY - Math.abs(Math.sin(ph)) * 3 * s };
  }
  if (pose.attackPhase === 'windup') {
    const p = pose.attackProgress;
    return { x: -10*s - p * 4*s, y: baseY - 18*s };
  }
  if (pose.attackPhase === 'strike') {
    return { x: m.reach, y: baseY - 14*s };
  }
  const p = pose.attackProgress;
  return { x: m.reach * (1-p) + 6*s*p, y: baseY - 14*s + 6*s*p };
}

function backArmTarget(pose: PoseState, m: BuildMetrics, s: number, off: number): Pt {
  const baseY = -((m.thigh + m.shin) * 0.55 + 2 * s) - m.bodyH + 26 * s;
  if (pose.attackPhase !== 'none') {
    // During any attack, back arm anchors or pulls back for power
    if (pose.attackKind === 'heavy' || pose.attackKind === 'special') {
      return { x: -m.shoulderW - 8*s, y: baseY - 8*s };
    }
    if (pose.attackKind === 'grenade') {
      // opposite arm extends back & down to counter-balance the throw
      return { x: -m.shoulderW - 10*s, y: baseY + 8*s };
    }
    if (pose.attackKind === 'shoot') {
      return { x: m.shoulderW * 0.3, y: baseY - 2*s };
    }
    return { x: -m.shoulderW - 6*s, y: baseY - 6*s };
  }
  const ph = pose.walkPhase + Math.PI + off;
  return { x: Math.sin(ph) * 8*s - m.shoulderW * 0.4, y: baseY };
}
