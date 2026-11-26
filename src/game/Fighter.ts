import type { Palette, EnemyBuild } from './constants';
import { depthScale, GROUND_Y_MIN, GROUND_Y_MAX, CANVAS_WIDTH } from './constants';
import { drawCharacter, type AttackPhase, type PoseState } from './render/character';

export type Facing = 1 | -1;

export interface AttackTiming {
  windup: number;
  strike: number;
  recover: number;
}

export abstract class Fighter {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  facing: Facing = 1;
  alive = true;

  // Animation
  walkPhase = Math.random() * Math.PI * 2;
  moving = false;
  attackElapsed = -1; // -1 = not attacking
  attackTotal = 0;
  attackTiming: AttackTiming = { windup: 0, strike: 0, recover: 0 };
  attackHitApplied = false;
  attackCooldown = 0;
  currentAttackKind: 'light' | 'heavy' | 'special' | 'uppercut' | 'shoot' | 'grenade' | 'none' = 'none';
  attackDamageOverride = -1; // -1 = use default
  attackRangeOverride = -1;
  hurtTimer = 0;
  hurtAmt = 0;
  deathTimer = 0;
  invulnTimer = 0;
  knockX = 0;
  lean = 0;
  isBoss = false;

  constructor(x: number, y: number, maxHp: number) {
    this.x = x;
    this.y = y;
    this.hp = maxHp;
    this.maxHp = maxHp;
  }

  get scale() { return depthScale(this.y); }

  abstract getPalette(): Palette;
  abstract getBuild(): EnemyBuild | 'player';
  abstract getAttackRangeX(): number;
  abstract getAttackRangeY(): number;
  abstract getAttackDamage(): number;
  abstract getSizeMult(): number;

  getHitbox() {
    const w = 36 * this.scale * this.getSizeMult();
    const h = 110 * this.scale * this.getSizeMult();
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  getAttackHitbox() {
    const reach = this.getAttackRangeX() * this.scale;
    const h = 96 * this.scale * this.getSizeMult();
    const off = this.facing === 1 ? 22 * this.scale : -22 * this.scale - reach;
    return { x: this.x + off, y: this.y - h, w: reach, h };
  }

  get attackPhase(): AttackPhase {
    if (this.attackElapsed < 0) return 'none';
    const e = this.attackElapsed;
    const t = this.attackTiming;
    if (e < t.windup) return 'windup';
    if (e < t.windup + t.strike) return 'strike';
    return 'recover';
  }

  get attackPhaseProgress(): number {
    const e = this.attackElapsed;
    const t = this.attackTiming;
    if (e < t.windup) return e / t.windup;
    if (e < t.windup + t.strike) return (e - t.windup) / t.strike;
    return (e - t.windup - t.strike) / Math.max(1, t.recover);
  }

  get isAttacking() { return this.attackElapsed >= 0; }

  get isStrikeActive(): boolean {
    return this.attackPhase === 'strike' && !this.attackHitApplied;
  }

  beginAttack(timing: AttackTiming, cooldown: number) {
    if (this.attackCooldown > 0 || this.attackElapsed >= 0 || !this.alive) return false;
    this.attackTiming = timing;
    this.attackTotal = timing.windup + timing.strike + timing.recover;
    this.attackElapsed = 0;
    this.attackHitApplied = false;
    this.attackCooldown = cooldown;
    return true;
  }

  takeDamage(amount: number, dir: number, knockback: number) {
    if (!this.alive || this.invulnTimer > 0) return false;
    this.hp -= amount;
    this.hurtTimer = 220;
    this.hurtAmt = 1;
    this.knockX += dir * knockback;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathTimer = 700;
    }
    return true;
  }

  clampPosition(left = 40, right = CANVAS_WIDTH - 40) {
    if (this.y < GROUND_Y_MIN) this.y = GROUND_Y_MIN;
    if (this.y > GROUND_Y_MAX) this.y = GROUND_Y_MAX;
    if (this.x < left) this.x = left;
    if (this.x > right) this.x = right;
  }

  update(dt: number) {
    // Attack timer
    if (this.attackElapsed >= 0) {
      this.attackElapsed += dt;
      if (this.attackElapsed >= this.attackTotal) {
        this.attackElapsed = -1;
      }
    }
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // Hurt flash decay
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      this.hurtAmt = Math.max(0, this.hurtTimer / 220);
    } else {
      this.hurtAmt = 0;
    }

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);

    // Knockback + lean
    this.x += this.knockX;
    this.knockX *= 0.82;
    if (Math.abs(this.knockX) < 0.05) this.knockX = 0;
    this.lean += (this.knockX * 0.05 - this.lean) * 0.2;
    this.clampPosition();

    // Walk cycle
    if (this.moving) {
      this.walkPhase += dt * 0.012;
    } else {
      // settle towards neutral slowly
      this.walkPhase += dt * 0.003;
    }

    if (!this.alive) this.deathTimer = Math.max(0, this.deathTimer - dt);
  }

  getPose(): PoseState {
    return {
      walkPhase: this.walkPhase,
      moving: this.moving,
      attackPhase: this.attackPhase,
      attackProgress: this.attackPhaseProgress,
      attackKind: this.currentAttackKind as PoseState['attackKind'],
      hurt: this.hurtAmt > 0,
      hurtAmt: this.hurtAmt,
      dead: !this.alive,
      deathProgress: this.alive ? 0 : 1 - this.deathTimer / 700,
      lean: this.lean,
      invuln: this.invulnTimer > 0,
      blink: this.invulnTimer > 0 ? (Math.sin(Date.now() / 60) > 0 ? 0.35 : 1) : 1,
    };
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.alive && this.deathTimer <= 0) return;
    drawCharacter(ctx, {
      x: this.x,
      y: this.y,
      scale: this.scale,
      facing: this.facing,
      palette: this.getPalette(),
      build: this.getBuild(),
      pose: this.getPose(),
    });
  }
}
