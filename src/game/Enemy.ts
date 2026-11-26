import { Fighter } from './Fighter';
import {
  ENEMY_TYPES,
  GROUND_Y_MIN, GROUND_Y_MAX,
} from './constants';
import type { EnemyBuild, EnemyTypeDef, LevelConfig, Palette } from './constants';

type AIState = 'idle' | 'chase' | 'retreat' | 'windup' | 'attack' | 'recover' | 'hurt' | 'dead';

export class Enemy extends Fighter {
  def: EnemyTypeDef;
  state: AIState = 'idle';
  stateTimer = 0;
  attackCdTimer = 0;
  spawnDelay = 0;
  preferredRange = 0;

  constructor(build: EnemyBuild, level: LevelConfig, x: number, y: number, spawnDelay = 0) {
    const def = ENEMY_TYPES[build];
    super(x, y, Math.round(def.hp * level.hpMult));
    this.def = def;
    this.isBoss = build === 'boss';
    this.attackCdTimer = def.cooldownMin + Math.random() * (def.cooldownMax - def.cooldownMin);
    this.spawnDelay = spawnDelay;
    this.state = 'idle';
    this.stateTimer = spawnDelay > 0 ? spawnDelay : 200 + Math.random() * 400;
    // preferred engagement distance
    if (def.ranged) this.preferredRange = (def.rangeX * 0.55);
    else this.preferredRange = def.rangeX * 0.85;
  }

  getPalette(): Palette { return this.def.palette; }
  getBuild(): EnemyBuild | 'player' { return this.def.key; }
  getSizeMult() { return this.def.sizeMult; }
  getAttackRangeX() { return this.def.rangeX; }
  getAttackRangeY() { return this.def.rangeY; }
  getAttackDamage() { return this.def.damage; }

  get effectiveSpeed(): number {
    return this.def.speed;
  }

  /** Returns true if the enemy fired a projectile this frame (so Game can spawn it). */
  updateAI(
    playerX: number, playerY: number, playerAlive: boolean,
    neighbors: { x: number; y: number }[], dt: number
  ): { startedAttack: boolean; firedProjectile: boolean } {
    let startedAttack = false;
    let firedProjectile = false;
    if (!this.alive) { this.state = 'dead'; return { startedAttack, firedProjectile }; }

    if (this.spawnDelay > 0) {
      this.spawnDelay -= dt;
      this.moving = false;
      return { startedAttack, firedProjectile };
    }

    const dx = playerX - this.x;
    const dy = playerY - this.y;
    const dist = Math.hypot(dx, dy);
    const horizDist = Math.abs(dx);

    // Always face player when alive
    if (this.alive) this.facing = dx >= 0 ? 1 : -1;

    switch (this.state) {
      case 'idle': {
        this.moving = false;
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'chase';
        break;
      }
      case 'chase': {
        if (!playerAlive) { this.moving = false; break; }

        const inRangeX = horizDist < this.def.rangeX;
        const inRangeY = Math.abs(dy) < this.def.rangeY;

        if (inRangeX && inRangeY && this.attackCdTimer <= 0) {
          this.state = 'windup';
          this.beginAttack(
            { windup: this.def.windup, strike: this.def.strike, recover: this.def.recover },
            0
          );
          startedAttack = true;
        } else {
          let mx = 0, my = 0;
          // Ranged: try to stay at preferred range
          if (this.def.ranged) {
            if (horizDist < this.preferredRange * 0.7) {
              // too close, retreat
              mx = dx >= 0 ? -1 : 1;
              my = dy > 0 ? -0.3 : 0.3;
              this.state = 'retreat';
            } else if (horizDist > this.preferredRange * 1.4) {
              // too far, approach
              mx = dx >= 0 ? 1 : -1;
              my = dy / (Math.abs(dy) + 1);
            } else {
              // strafe
              mx = 0;
              my = Math.sin(this.walkPhase * 0.5) * 0.5;
            }
          } else {
            // Melee: run to player
            if (dist > 1) {
              mx = dx / dist;
              my = dy / dist;
            }
          }
          // Separation
          for (const n of neighbors) {
            const ndx = this.x - n.x;
            const ndy = this.y - n.y;
            const nd = Math.hypot(ndx, ndy);
            if (nd > 0.1 && nd < 46) {
              mx += (ndx / nd) * (1 - nd / 46) * 0.9;
              my += (ndy / nd) * (1 - nd / 46) * 0.5;
            }
          }
          const len = Math.hypot(mx, my) || 1;
          this.x += (mx / len) * this.effectiveSpeed;
          this.y += (my / len) * this.effectiveSpeed * 0.8;
          this.moving = true;
        }
        break;
      }
      case 'retreat': {
        if (!playerAlive) break;
        if (horizDist > this.preferredRange) this.state = 'chase';
        const mx = dx >= 0 ? -1 : 1;
        this.x += mx * this.effectiveSpeed;
        this.moving = true;
        break;
      }
      case 'windup':
      case 'attack':
      case 'recover': {
        this.moving = false;
        // At the start of strike phase, if ranged, emit projectile
        if (this.def.ranged && this.attackPhase === 'strike' && !this.attackHitApplied) {
          firedProjectile = true;
          this.attackHitApplied = true;
        }
        // melee: clear the hit flag on recover end
        if (!this.def.ranged) {
          // for melee, hit flag handled in collision phase
        }
        if (this.attackElapsed < 0) {
          this.state = 'chase';
          this.attackCdTimer = this.def.cooldownMin + Math.random() * (this.def.cooldownMax - this.def.cooldownMin);
        }
        break;
      }
      case 'hurt': {
        this.moving = false;
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.state = 'chase';
        break;
      }
      case 'dead': break;
    }

    if (this.attackCdTimer > 0) this.attackCdTimer -= dt;

    this.y = Math.max(GROUND_Y_MIN, Math.min(GROUND_Y_MAX, this.y));
    this.x = Math.max(50, Math.min(974, this.x));
    return { startedAttack, firedProjectile };
  }

  onHit(): void {
    if (this.alive) {
      this.state = 'hurt';
      this.stateTimer = 160;
    }
  }
}
