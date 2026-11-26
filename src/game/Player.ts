import { Fighter } from './Fighter';
import {
  PLAYER_MAX_HP,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_RANGE_X,
  PLAYER_ATTACK_RANGE_Y,
  PLAYER_PALETTE,
  ATTACKS,
} from './constants';
import type { Palette, EnemyBuild, WeaponType } from './constants';

export type AttackKind = 'light' | 'heavy' | 'special' | 'uppercut';

export class Player extends Fighter {
  private weapons: Record<WeaponType, number> = { pistol: 0, grenade: 0, knife: 0 };
  private currentWeapon: WeaponType | null = null;
  private switchCooldown = 0;
  comboStep = 0;
  private comboTimer = 0;
  // Dash state
  dashing = false;
  dashVx = 0;
  dashVy = 0;
  dashTime = 0;

  constructor(x: number, y: number) {
    super(x, y, PLAYER_MAX_HP);
  }

  getPalette(): Palette { return PLAYER_PALETTE; }
  getBuild(): EnemyBuild | 'player' { return 'player'; }
  getSizeMult() { return 1.0; }
  getAttackRangeX() { return PLAYER_ATTACK_RANGE_X; }
  getAttackRangeY() { return PLAYER_ATTACK_RANGE_Y; }
  getAttackDamage() { return PLAYER_ATTACK_DAMAGE; }

  // Weapon inventory
  addWeapon(type: WeaponType, qty: number) {
    this.weapons[type] += qty;
    if (this.currentWeapon === null) this.currentWeapon = type;
  }
  getWeaponAmmo(type: WeaponType) { return this.weapons[type]; }
  getCurrentWeapon() { return this.currentWeapon; }
  getAllWeapons(): { type: WeaponType; qty: number }[] {
    return (['pistol', 'grenade', 'knife'] as WeaponType[])
      .map(type => ({ type, qty: this.weapons[type] }))
      .filter(w => w.qty > 0);
  }

  consumeAmmo(type: WeaponType): boolean {
    if (this.weapons[type] <= 0) return false;
    this.weapons[type]--;
    if (this.weapons[type] === 0 && this.currentWeapon === type) {
      // switch to next available
      const next = this.getAllWeapons()[0];
      this.currentWeapon = next ? next.type : null;
    }
    return true;
  }

  switchWeapon(dir: 1 | -1) {
    if (this.switchCooldown > 0) return;
    this.switchCooldown = 200;
    const avail = this.getAllWeapons();
    if (avail.length === 0) { this.currentWeapon = null; return; }
    if (this.currentWeapon === null) { this.currentWeapon = avail[0].type; return; }
    const idx = avail.findIndex(w => w.type === this.currentWeapon);
    const nextIdx = (idx + dir + avail.length) % avail.length;
    this.currentWeapon = avail[nextIdx].type;
  }

  // Combo tracking
  bumpCombo() {
    this.comboStep = (this.comboStep + 1) % 4;
    this.comboTimer = 800;
  }
  resetCombo() { this.comboStep = 0; this.comboTimer = 0; }

  chooseAttackKind(globalCombo: number = 0): AttackKind {
    // Every 8th hit when in combo: dramatic special finisher
    if (globalCombo > 0 && globalCombo % 8 === 0) return 'special';
    if (this.comboTimer > 0) {
      const chain: AttackKind[] = ['light', 'light', 'uppercut', 'heavy'];
      return chain[this.comboStep % chain.length];
    }
    return 'light';
  }

  canAttack(): boolean {
    return !this.dashing && this.attackCooldown <= 0 && this.attackElapsed < 0 && this.alive;
  }

  // Melee attack
  attackMelee(kind: AttackKind): boolean {
    const cfg = ATTACKS[kind];
    const ok = this.beginAttack(
      { windup: cfg.windup, strike: cfg.strike, recover: cfg.recover },
      cfg.cooldown
    );
    if (ok) {
      this.currentAttackKind = kind;
      this.bumpCombo();
    }
    return ok;
  }

  // Weapon shooting
  shootWeapon(type: WeaponType, cooldown: number): boolean {
    if (!this.consumeAmmo(type)) return false;
    // Grenade uses a longer, dramatic overhead-throw animation.
    if (type === 'grenade') {
      if (!this.beginAttack({ windup: 360, strike: 120, recover: 260 }, cooldown)) return false;
      this.currentAttackKind = 'grenade';
    } else {
      if (!this.beginAttack({ windup: 140, strike: 180, recover: 280 }, cooldown)) return false;
      this.currentAttackKind = 'shoot';
    }
    return true;
  }

  update(dt: number) {
    super.update(dt);
    if (this.switchCooldown > 0) this.switchCooldown = Math.max(0, this.switchCooldown - dt);
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboStep = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.alive && this.deathTimer <= 0) return;
    super.draw(ctx);
    // Draw held weapon on top
    if (this.currentWeapon && this.attackPhase === 'strike') {
      this.drawHeldWeapon(ctx);
    }
  }

  private drawHeldWeapon(ctx: CanvasRenderingContext2D) {
    const scale = this.scale;
    const reach = 60 * scale;
    const hx = this.x + this.facing * reach;
    const hy = this.y - 56 * scale;
    ctx.save();
    ctx.translate(hx, hy);
    if (this.facing === -1) ctx.scale(-1, 1);
    if (this.currentWeapon === 'pistol') {
      ctx.fillStyle = '#333';
      ctx.fillRect(-4, -6, 20, 12);
      ctx.fillStyle = '#ffd23b';
      ctx.fillRect(14, -3, 6, 6);
      // muzzle flash
      ctx.fillStyle = '#ffff88';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(22, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.currentWeapon === 'knife') {
      ctx.fillStyle = '#c0c0d0';
      ctx.beginPath();
      ctx.moveTo(-2, -2);
      ctx.lineTo(26, 0);
      ctx.lineTo(-2, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2fe7ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (this.currentWeapon === 'grenade') {
      ctx.fillStyle = '#444';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(-3, -11, 6, 4);
    }
    ctx.restore();
  }
}
