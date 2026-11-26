import { InputManager } from './InputManager';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { Fighter } from './Fighter';
import { Particles } from './Particles';
import { AudioEngine } from './audio/AudioEngine';
import { createBgState, updateBgState, drawBackground } from './render/background';
import { createProp, updateProps, drawProp, type Prop } from './Props';
import {
  CANVAS_WIDTH, CANVAS_HEIGHT,
  PLAYER_SPEED, PLAYER_START_LIVES, PLAYER_KNOCKBACK_RESIST,
  PLAYER_INVULN_RESPAWN, ATTACKS,
  COMBO_WINDOW, PICKUP_HEAL, PICKUP_DROP_CHANCE, WEAPON_DROP_CHANCE,
  GROUND_Y_MIN, GROUND_Y_MAX,
  LEVELS, WEAPONS,
} from './constants';
import type { LevelConfig, WeaponPickup, Projectile, WeaponType } from './constants';

export interface HudRefs {
  healthFill: HTMLElement;
  healthText: HTMLElement;
  livesEl: HTMLElement;
  scoreEl: HTMLElement;
  comboEl: HTMLElement;
  levelEl: HTMLElement;
  waveEl: HTMLElement;
  bossWrap: HTMLElement;
  bossFill: HTMLElement;
  bossName: HTMLElement;
  weaponsEl: HTMLElement;
}

type GameState = 'title' | 'intro' | 'playing' | 'paused' | 'levelClear' | 'gameOver' | 'victory';

export class Game {
  private ctx: CanvasRenderingContext2D;
  private input: InputManager;
  private audio: AudioEngine;
  private hud: HudRefs;

  private player: Player;
  private enemies: Enemy[] = [];
  private pickups: WeaponPickup[] = [];
  private projectiles: Projectile[] = [];
  private props: Prop[] = [];
  private pendingShot: WeaponType | null = null;
  private particles = new Particles();
  private bg = createBgState();

  private levelIndex = 0;
  private level!: LevelConfig;
  private wavesSpawned = 0;
  private bossSpawned = false;
  private waveTimer = 0;

  private score = 0;
  private lives = PLAYER_START_LIVES;
  private combo = 0;
  private comboTimer = 0;
  private bestCombo = 0;

  private state: GameState = 'title';
  private introTimer = 0;
  private clearTimer = 0;
  private titleTime = 0;
  private goFlash = 0;

  private shakeTime = 0;
  private shakeMag = 0;
  private freezeTime = 0;
  private flashWhite = 0;

  private lastTime = 0;
  private running = false;
  private animId = 0;

  constructor(canvas: HTMLCanvasElement, hud: HudRefs, audio: AudioEngine) {
    this.ctx = canvas.getContext('2d')!;
    this.input = new InputManager();
    this.audio = audio;
    this.hud = hud;
    this.level = LEVELS[0];
    this.player = new Player(CANVAS_WIDTH / 4, (GROUND_Y_MIN + GROUND_Y_MAX) / 2);

    canvas.addEventListener('mousedown', () => this.input.queueClick());
  }

  // ====== PUBLIC ======
  beginGame() {
    this.audio.init();
    this.score = 0;
    this.lives = PLAYER_START_LIVES;
    this.combo = 0;
    this.bestCombo = 0;
    this.levelIndex = 0;
    this.loadLevel(0);
    this.state = 'intro';
    this.introTimer = 2800;
    this.audio.startMusic();
  }

  togglePause() {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
  }
  restartGame() { this.beginGame(); }
  setMusicEnabled(b: boolean) { this.audio.setMusicEnabled(b); }
  setSfxEnabled(b: boolean) { this.audio.setSfxEnabled(b); }
  setTouchMove(x: number, y: number) { this.input.setTouchMove(x, y); }
  setTouchAttack(down: boolean) { this.input.setTouchAttack(down); }
  triggerHeavyAttack() { this.input.queueHeavy(); }
  setTouchShoot() { this.input.queueShoot(); }
  setTouchDash() {
    const p = this.player;
    if (p.dashing || !p.alive) return;
    // Dash in facing direction
    p.dashVx = p.facing * 8;
    p.dashVy = 0;
    p.dashTime = 220;
    p.invulnTimer = Math.max(p.invulnTimer, 220);
    p.dashing = true;
    this.audio.sfxSwing();
    this.particles.burst(p.x, p.y - 30, '#2fe7ff', 10, { speed: 3 });
  }
  setTouchSwitch() {
    if (this.state === 'playing') {
      this.player.switchWeapon(1);
      this.audio.sfxSwitch();
    }
  }

  // ====== LEVEL ======
  private loadLevel(i: number) {
    this.levelIndex = i;
    this.level = LEVELS[i];
    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    this.props = [];
    this.pendingShot = null;
    this.particles.clear();
    this.bg.weather = [];
    this.wavesSpawned = 0;
    this.bossSpawned = false;
    this.waveTimer = 0;
    this.player.x = CANVAS_WIDTH / 4;
    this.player.y = (GROUND_Y_MIN + GROUND_Y_MAX) / 2;
    this.player.hp = this.player.maxHp;
    this.player.invulnTimer = 800;
    this.audio.setMusic(this.level.music);
    this.spawnLevelProps();
    this.updateHud();
  }

  private spawnLevelProps() {
    // Scatter 3-5 barrels/crates per level at random ground positions
    const count = 3 + Math.floor(Math.random() * 3);
    const taken: { x: number; y: number }[] = [{ x: this.player.x, y: this.player.y }];
    const contentPool: (import('./constants').PickupType | null)[] = [
      'heal', 'heal', 'pistol', 'grenade', 'knife', null, null, null,
    ];
    for (let i = 0; i < count; i++) {
      let x = 0, y = 0, ok = false;
      for (let tries = 0; tries < 10 && !ok; tries++) {
        x = 200 + Math.random() * (CANVAS_WIDTH - 360);
        y = GROUND_Y_MIN + 30 + Math.random() * (GROUND_Y_MAX - GROUND_Y_MIN - 40);
        ok = taken.every(t => Math.hypot(t.x - x, t.y - y) > 90);
      }
      if (!ok) continue;
      taken.push({ x, y });
      const kind = Math.random() < 0.55 ? 'barrel' : 'crate';
      const contents = contentPool[Math.floor(Math.random() * contentPool.length)];
      this.props.push(createProp(kind, x, y, contents));
    }
  }

  private spawnWave() {
    const lv = this.level;
    const count = lv.perWaveMin + Math.floor(Math.random() * (lv.perWaveMax - lv.perWaveMin + 1));
    for (let i = 0; i < count; i++) {
      const build = lv.enemyMix[Math.floor(Math.random() * lv.enemyMix.length)];
      const x = CANVAS_WIDTH - 80 - Math.random() * 160;
      const y = GROUND_Y_MIN + 20 + Math.random() * (GROUND_Y_MAX - GROUND_Y_MIN - 20);
      const delay = i * 360 + Math.random() * 200;
      this.enemies.push(new Enemy(build, lv, x, y, delay));
    }
  }

  private spawnBoss() {
    const boss = new Enemy('boss', this.level, CANVAS_WIDTH - 150, (GROUND_Y_MIN + GROUND_Y_MAX) / 2, 0);
    this.enemies.push(boss);
    this.bossSpawned = true;
    this.flashWhite = 0.6;
    this.addShake(8, 500);
    this.particles.text(CANVAS_WIDTH / 2, 200, 'LE PATRON ARRIVE !', this.level.theme.accent, 26);
    this.audio.sfxEnemyDeath();
  }

  // ====== UPDATE ======
  private update(dt: number) {
    this.titleTime += dt;
    if (this.shakeTime > 0) { this.shakeTime -= dt; if (this.shakeTime <= 0) this.shakeMag = 0; }
    if (this.flashWhite > 0) this.flashWhite = Math.max(0, this.flashWhite - dt / 300);

    updateBgState(this.bg, dt, this.level.theme);
    this.particles.update(dt);

    if (this.state === 'title') {
      if (this.input.confirmPressed() || this.input.consumeClick()) this.beginGame();
      return;
    }
    if (this.state === 'paused') {
      if (this.input.pausePressed()) this.state = 'playing';
      if (this.input.wasPressed('r')) this.restartGame();
      return;
    }
    if (this.state === 'intro') {
      this.introTimer -= dt;
      this.player.update(dt);
      if (this.introTimer <= 0) { this.state = 'playing'; this.spawnWave(); this.wavesSpawned = 1; }
      return;
    }
    if (this.state === 'levelClear') {
      this.clearTimer -= dt;
      for (const e of this.enemies) e.update(dt);
      this.player.update(dt);
      if (this.clearTimer <= 0) {
        if (this.levelIndex + 1 < LEVELS.length) {
          this.loadLevel(this.levelIndex + 1);
          this.state = 'intro';
          this.introTimer = 2800;
        } else {
          this.state = 'victory';
          this.audio.sfxVictory();
        }
      }
      return;
    }
    if (this.state === 'gameOver' || this.state === 'victory') {
      if (this.input.confirmPressed() || this.input.wasPressed('r') || this.input.consumeClick()) {
        this.state = 'title';
      }
      return;
    }

    if (this.freezeTime > 0) {
      this.freezeTime -= dt;
      this.player.update(dt);
      for (const e of this.enemies) e.update(dt);
      return;
    }

    // PLAYING
    if (this.input.pausePressed()) { this.state = 'paused'; return; }
    this.updatePlaying(dt);
  }

  private updatePlaying(dt: number) {
    const p = this.player;

    // Weapon switching (Q/E)
    if (this.input.wasPressed('q') || this.input.wasPressed('a')) {
      p.switchWeapon(-1);
      this.audio.sfxSwitch();
    }
    if (this.input.wasPressed('e')) {
      p.switchWeapon(1);
      this.audio.sfxSwitch();
    }

    // Movement
    const { dx, dy } = this.input.getMovement();
    p.moving = false;

    // Dash (Shift + direction, or double-tap)
    if (this.input.wasPressed('shift') && (dx !== 0 || dy !== 0) && !p.dashing) {
      const dashLen = Math.hypot(dx, dy) || 1;
      p.dashVx = (dx / dashLen) * 8;
      p.dashVy = (dy / dashLen) * 8;
      p.dashTime = 220;
      p.invulnTimer = Math.max(p.invulnTimer, 220);
      p.dashing = true;
      this.audio.sfxSwing();
      this.particles.burst(p.x, p.y - 30, '#2fe7ff', 10, { speed: 3 });
    }
    if (p.dashing) {
      p.dashTime -= dt;
      if (p.dashTime <= 0) { p.dashing = false; p.dashVx = 0; p.dashVy = 0; }
      else {
        p.x += p.dashVx;
        p.y += p.dashVy;
        if (p.dashVx !== 0) p.facing = p.dashVx > 0 ? 1 : -1;
        p.moving = true;
        this.particles.dust(p.x - p.dashVx * 3, p.y, 'rgba(47,231,255,0.7)');
        // Cyan streak particles along the trail
        if (Math.random() < 0.7) {
          this.particles.burst(p.x - p.dashVx * 1.5, p.y - 40 * p.scale + (Math.random() - 0.5) * 30, '#2fe7ff', 1, { speed: 0.4, gravity: -0.02, size: 0.7 });
        }
      }
    } else if ((dx !== 0 || dy !== 0) && p.alive && p.invulnTimer < PLAYER_INVULN_RESPAWN - 200) {
      p.x += dx * PLAYER_SPEED;
      p.y += dy * PLAYER_SPEED;
      if (dx !== 0) p.facing = dx > 0 ? 1 : -1;
      p.moving = true;
    }
    p.clampPosition();

    // Attack handling
    let heavyPressed = this.input.wasPressed('shift') || this.input.consumeHeavy();
    const shootPressed = this.input.wasPressed('f') || this.input.consumeShoot();
    // If we dashed with shift, don't count it as heavy attack
    if (heavyPressed && p.dashing) heavyPressed = false;

    if (p.canAttack()) {
      // Weapon shoot
      if (shootPressed && p.getCurrentWeapon()) {
        const type = p.getCurrentWeapon()!;
        const def = WEAPONS[type];
        if (p.shootWeapon(type, def.cooldown)) {
          // Projectile is released later, at the exact strike frame of the animation.
          this.pendingShot = type;
        }
      }
      // Heavy attack (Shift / right-click)
      else if (heavyPressed) {
        const kind = p.chooseAttackKind();
        let chosen: 'light' | 'heavy' | 'special' | 'uppercut' = kind;
        if (kind === 'light') {
          if (p.comboStep === 2 || p.comboStep === 0) chosen = 'heavy';
          else chosen = 'uppercut';
        }
        p.attackMelee(chosen);
        if (chosen === 'heavy') this.audio.sfxHeavySwing();
        else if (chosen === 'uppercut') this.audio.sfxUppercut();
        else this.audio.sfxSwing();
      }
      // Light attack (Space/J) - uses combo chain
      else if (this.input.attackPressed()) {
        if (!p.moving) {
          let best: Enemy | null = null;
          let bd = 9999;
          for (const e of this.enemies) {
            if (!e.alive || e.spawnDelay > 0) continue;
            const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 1.6;
            if (d < bd) { bd = d; best = e; }
          }
          if (best && bd < 260) p.facing = best.x >= p.x ? 1 : -1;
        }
        const kind = p.chooseAttackKind(this.combo);
        p.attackMelee(kind);
        if (kind === 'special') {
          this.audio.sfxUppercut();
          this.flashWhite = 0.5;
          this.particles.text(p.x, p.y - 130 * p.scale, 'FINISHER !', '#ff3b8a', 22);
        } else if (kind === 'heavy') this.audio.sfxHeavySwing();
        else if (kind === 'uppercut') this.audio.sfxUppercut();
        else this.audio.sfxSwing();
      }
    }
    p.update(dt);
    this.releasePendingShot();

    if (p.moving && Math.random() < 0.25) {
      this.particles.dust(p.x - p.facing * 12, p.y);
    }

    // Enemies
    const neighbors = this.enemies.filter(e => e.alive).map(e => ({ x: e.x, y: e.y }));
    for (const e of this.enemies) {
      const r = e.updateAI(p.x, p.y, p.alive, neighbors, dt);
      if (r.startedAttack) {
        this.audio.sfxSwing();
      }
      if (r.firedProjectile) {
        const def = e.def;
        const speed = def.projectileSpeed ?? 6;
        const sx = e.x + e.facing * 28;
        const sy = e.y - 50 * e.scale;
        const pType = e.def.key === 'archer' ? 'knife' : e.def.key === 'sniper' ? 'pistol' : 'grenade';
        if (pType === 'grenade') {
          // thrower lobs a grenade at the player
          this.launchGrenade(sx, sy, p.x, p.y, def.damage, 'enemy');
        } else {
          const dxp = p.x - sx;
          const dyp = (p.y - 50 * p.scale) - sy;
          const d = Math.hypot(dxp, dyp) || 1;
          this.projectiles.push({
            x: sx, y: sy,
            vx: (dxp / d) * speed, vy: (dyp / d) * speed * 0.45,
            z: 0, vz: 0,
            damage: def.damage, type: pType, life: 2200, fuse: 0, owner: 'enemy',
            rot: 0, vrot: pType === 'knife' ? 0.9 : 0, bounces: 0,
            pierceLeft: 0, hits: [], born: 0,
          });
        }
        this.audio.sfxShoot(pType);
      }
      e.update(dt);
      if (e.moving && Math.random() < 0.12) this.particles.dust(e.x - e.facing * 10, e.y);
    }

    // Update projectiles
    this.updateProjectiles(dt);

    // Update props (barrels / crates)
    this.props = updateProps(this.props, dt);

    // Collisions
    this.handleCollisions();
    this.handlePropCollisions();

    // Remove corpses
    this.enemies = this.enemies.filter(e => e.alive || e.deathTimer > 0);

    // Pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.life -= dt;
      pk.spin += dt * 0.005;
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (d < 42 && Math.abs(pk.y - p.y) < 40 && p.alive) {
        if (pk.type === 'heal') {
          p.hp = Math.min(p.maxHp, p.hp + PICKUP_HEAL);
          this.particles.text(pk.x, pk.y - 30, `+${PICKUP_HEAL}`, '#2bff7a', 18);
          this.particles.burst(pk.x, pk.y, '#2bff7a', 14, { speed: 3 });
          this.audio.sfxPickup();
        } else {
          const def = WEAPONS[pk.type];
          p.addWeapon(pk.type, def.ammo);
          this.particles.text(pk.x, pk.y - 30, `${def.name} +${def.ammo}`, def.color, 18);
          this.particles.burst(pk.x, pk.y, def.color, 18, { speed: 3 });
          this.audio.sfxPickup();
          this.audio.sfxCombo(2);
        }
        this.pickups.splice(i, 1);
        continue;
      }
      if (pk.life <= 0) this.pickups.splice(i, 1);
    }

    // Combo timer
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.combo = 0; }
    }

    // Wave management
    const aliveEnemies = this.enemies.filter(e => e.alive).length;
    this.goFlash += dt;
    if (aliveEnemies === 0) {
      if (this.wavesSpawned < this.level.waves) {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) {
          this.spawnWave();
          this.wavesSpawned++;
          this.waveTimer = 0;
        }
      } else if (this.level.hasBoss && !this.bossSpawned) {
        this.spawnBoss();
      } else {
        this.state = 'levelClear';
        this.clearTimer = 2600;
        const bonus = 500 + this.bestCombo * 20;
        this.score += bonus;
        this.audio.sfxLevelClear();
        this.particles.text(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40, `NIVEAU TERMINÉ +${bonus}`, '#ffd23b', 24);
      }
    } else {
      this.waveTimer = 1100;
    }

    this.updateHud();
  }

  // Aim & launch a weapon from the player with appropriate physics.
  private releasePendingShot() {
    if (!this.pendingShot) return;
    const p = this.player;
    // Wait for the strike frame: pistol/knife fire from the aiming pose;
    // grenade leaves the hand after the overhead windup.
    if (p.attackPhase === 'strike') {
      this.firePlayerWeapon(this.pendingShot);
      this.pendingShot = null;
      p.attackHitApplied = true;
    } else if (!p.isAttacking) {
      this.pendingShot = null;
    }
  }

  private firePlayerWeapon(type: WeaponType) {
    const p = this.player;
    const def = WEAPONS[type];
    const sx = p.x + p.facing * 26;
    const sy = p.y - 50 * p.scale;

    if (type === 'grenade') {
      // Aim at the nearest enemy; fall back to a fixed range in facing dir.
      const target = this.nearestEnemy(p.x, p.y);
      let tx = p.x + p.facing * 260;
      let ty = p.y;
      if (target) { tx = target.x; ty = target.y; }
      this.launchGrenade(sx, sy, tx, ty, def.damage, 'player');
    } else {
      // Pistol / knife: straight line, slight depth lead
      const target = this.nearestEnemy(p.x, p.y);
      let vx = p.facing * def.speed;
      let vy = 0;
      if (target && !p.moving) {
        const d = Math.hypot(target.x - sx, target.y - sy) || 1;
        vx = ((target.x - sx) / d) * def.speed;
        vy = ((target.y - sy) / d) * def.speed;
      }
      this.projectiles.push({
        x: sx, y: sy, vx, vy, z: 0, vz: 0,
        damage: def.damage, type, life: 2200, fuse: 0, owner: 'player',
        rot: 0, vrot: type === 'knife' ? 0.9 : 0, bounces: 0,
        pierceLeft: type === 'knife' ? 2 : 0, hits: [], born: 0,
      });
    }
    if (type === 'grenade') this.audio.sfxGrenadeThrow();
    else this.audio.sfxShoot(type);
  }

  private nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = 9999;
    for (const e of this.enemies) {
      if (!e.alive || e.spawnDelay > 0) continue;
      const d = Math.abs(e.x - x) + Math.abs(e.y - y) * 1.4;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Solve a ballistic arc from (sx,sy) to land near (tx,ty) using gravity.
  private launchGrenade(sx: number, sy: number, tx: number, ty: number, damage: number, owner: 'player' | 'enemy') {
    const gravity = 0.42;
    const dx = tx - sx;
    const desiredTime = Math.max(28, Math.min(70, Math.abs(dx) * 0.18 + 26));
    const vx = dx / desiredTime;
    // depth drift toward target depth
    const vy = (ty - sy) / desiredTime;
    // initial upward velocity so it peaks and lands at desiredTime
    const vz = gravity * desiredTime * 0.5 + 2.2; // adds an arc apex
    this.projectiles.push({
      x: sx, y: sy, vx, vy, z: 0, vz,
      damage, type: 'grenade', life: 4000,
      fuse: desiredTime * 16 + 120, // explode shortly after the computed landing
      owner,
      rot: 0, vrot: (Math.random() < 0.5 ? -1 : 1) * 0.35,
      bounces: 0, pierceLeft: 0, hits: [], born: 0,
    });
    void gravity;
  }

  private updateProjectiles(dt: number) {
    const gravity = 0.42;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.born += dt;

      if (pr.type === 'grenade') {
        // Ballistic arc
        pr.x += pr.vx;
        pr.y += pr.vy;
        pr.z += pr.vz;
        pr.vz -= gravity;
        pr.rot += pr.vrot;
        pr.fuse -= dt;
        // Trail of smoke / sparks
        if (pr.born % 2 < 1) {
          this.particles.dust(pr.x, pr.y - pr.z, 'rgba(255,180,90,0.5)');
        }
        // Ground bounce / landing
        if (pr.z <= 0 && pr.vz < 0) {
          pr.z = 0;
          if (pr.bounces < 1 && Math.abs(pr.vz) > 1.5) {
            pr.vz = -pr.vz * 0.4;
            pr.vx *= 0.6;
            pr.vy *= 0.6;
            pr.bounces++;
            this.particles.dust(pr.x, pr.y, 'rgba(200,200,220,0.6)');
            this.audio.sfxGrenadeBounce();
          } else {
            // skid to a stop, let fuse finish
            pr.vz = 0;
            pr.vx *= 0.8;
            pr.vy *= 0.8;
          }
        }
        // Detonate
        if (pr.fuse <= 0) {
          this.explode(pr.x, pr.y, pr.damage, pr.owner);
          this.projectiles.splice(i, 1);
          continue;
        }
      } else {
        // Pistol / knife: straight travel
        pr.x += pr.vx;
        pr.y += pr.vy;
        pr.life -= dt;
        pr.rot += pr.vrot;
        if (pr.type === 'knife' && pr.born % 2 < 1) {
          this.particles.dust(pr.x, pr.y, WEAPONS[pr.type].color);
        }
        if (pr.x < -50 || pr.x > CANVAS_WIDTH + 50 || pr.life <= 0) {
          this.projectiles.splice(i, 1);
          continue;
        }
      }
    }
  }

  private explode(x: number, y: number, damage: number, owner: 'player' | 'enemy') {
    // Multi-layered explosion
    this.particles.ring(x, y, '#ffd23b', 1.6);
    this.particles.ring(x, y, '#ff8a3b', 2.4);
    this.particles.burst(x, y, '#ffd23b', 24, { speed: 6, size: 1.3, gravity: 0.18 });
    this.particles.burst(x, y, '#ff3b5c', 30, { speed: 8, size: 1.6, gravity: 0.22 });
    // smoke
    this.particles.burst(x, y, 'rgba(60,60,70,0.7)', 14, { speed: 2.5, size: 2, gravity: -0.04 });
    // debris shards
    this.particles.burst(x, y, '#7a5a35', 16, { speed: 5, size: 1.2, gravity: 0.3 });
    this.addShake(14, 420);
    this.freezeTime = Math.max(this.freezeTime, 110);
    this.flashWhite = Math.max(this.flashWhite, 0.25);
    this.audio.sfxExplosion();

    // Area damage with falloff
    const radius = 110;
    const targets = owner === 'player' ? this.enemies.filter(e => e.alive) : [this.player];
    for (const t of targets) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < radius) {
        const falloff = 1 - d / radius;
        const dir = t.x > x ? 1 : -1;
        const dmg = Math.round(damage * (0.5 + falloff * 0.5));
        t.takeDamage(dmg, dir, 30 + falloff * 18);
        if (t instanceof Enemy) t.onHit();
        if (t instanceof Enemy && !t.alive) {
          this.onEnemyKilled(t, 1, true);
        }
      }
    }
  }

  private depthOk(a: Fighter, b: Fighter, tol: number) {
    return Math.abs(a.y - b.y) <= tol;
  }
  private aabbX(ax: number, aw: number, bx: number, bw: number) {
    return ax < bx + bw && ax + aw > bx;
  }

  private handleCollisions() {
    const p = this.player;

    // Player melee attack vs enemies
    if (p.isStrikeActive) {
      const attackCfg = ATTACKS[p.currentAttackKind as keyof typeof ATTACKS] ?? ATTACKS.light;
      const range = attackCfg.range;
      const dmg = attackCfg.damage;
      const kb = attackCfg.knockback;
      const box = {
        x: p.x + (p.facing === 1 ? 20 * p.scale : -20 * p.scale - range * p.scale),
        y: p.y - 96 * p.scale,
        w: range * p.scale,
        h: 96 * p.scale,
      };
      for (const e of this.enemies) {
        if (!e.alive || e.spawnDelay > 0) continue;
        const eb = e.getHitbox();
        if (this.depthOk(p, e, p.getAttackRangeY()) && this.aabbX(box.x, box.w, eb.x, eb.w)) {
          e.takeDamage(dmg, p.facing, kb);
          e.onHit();
          p.attackHitApplied = true;
          const hx = e.x - p.facing * 10;
          const hy = e.y - 60 * e.scale;
          this.particles.burst(hx, hy, e.getPalette().accent, 16, { speed: 5 });
          this.particles.ring(hx, hy, '#ffffff', 1.2);
          this.audio.sfxHit(e.isBoss ? 1.4 : 1);
          this.addShake(e.isBoss ? 9 : 5 + (p.currentAttackKind === 'special' ? 3 : 0), 180);
          this.freezeTime = Math.max(this.freezeTime, e.isBoss ? 100 : 60);

          // Combo
          this.combo++;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.comboTimer = COMBO_WINDOW;
          const mult = 1 + Math.floor(this.combo / 4) * 0.5;
          if (this.combo >= 2) {
            this.particles.text(e.x, e.y - 110 * e.scale, `x${this.combo}`, '#ffd23b', 16);
            this.audio.sfxCombo(this.combo);
          }
          if (!e.alive) {
            this.onEnemyKilled(e, mult);
          }
          break;
        }
      }
      p.attackHitApplied = true;
    }

    // Projectile vs enemies (player projectiles) — grenades are excluded: they
    // deal damage via their timed explosion (explode()), not direct impact.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.owner === 'player' && pr.type !== 'grenade') {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if ((pr.hits as Enemy[]).includes(e)) continue;
          const eb = e.getHitbox();
          if (pr.x > eb.x && pr.x < eb.x + eb.w && pr.y > eb.y && pr.y < eb.y + eb.h) {
            e.takeDamage(pr.damage, pr.vx > 0 ? 1 : -1, 20);
            e.onHit();
            this.particles.burst(pr.x, pr.y, WEAPONS[pr.type].color, 14, { speed: 5 });
            this.particles.ring(pr.x, pr.y, '#ffffff', 0.8);
            this.audio.sfxHit(1.2);
            this.addShake(5, 180);
            this.combo++;
            this.bestCombo = Math.max(this.bestCombo, this.combo);
            this.comboTimer = COMBO_WINDOW;
            this.particles.text(pr.x, pr.y - 12, `+${pr.damage}`, WEAPONS[pr.type].color, 14);
            if (!e.alive) this.onEnemyKilled(e, 1);
            (pr.hits as Enemy[]).push(e);
            // Knife pierces through multiple enemies
            if (pr.type === 'knife' && pr.pierceLeft > 0) {
              pr.pierceLeft--;
              continue;
            }
            this.projectiles.splice(i, 1);
            break;
          }
        }
      } else if (pr.owner === 'enemy' && pr.type !== 'grenade') {
        // Enemy projectile vs player
        const pb = p.getHitbox();
        if (pr.x > pb.x && pr.x < pb.x + pb.w && pr.y > pb.y && pr.y < pb.y + pb.h) {
          const applied = p.takeDamage(pr.damage, pr.vx > 0 ? 1 : -1, 18);
          if (applied) {
            this.particles.burst(p.x, p.y - 60 * p.scale, '#ff3b5c', 14, { speed: 4 });
            this.audio.sfxPlayerHurt();
            this.addShake(7, 260);
            this.freezeTime = Math.max(this.freezeTime, 80);
            this.combo = 0;
            p.invulnTimer = Math.max(p.invulnTimer, 380);
            if (!p.alive) this.onPlayerDeath();
          }
          this.projectiles.splice(i, 1);
        }
      }
    }

    // Enemy melee attack vs player
    for (const e of this.enemies) {
      if (!e.alive || !e.isStrikeActive || e.def.ranged) continue;
      const box = e.getAttackHitbox();
      const pb = p.getHitbox();
      if (this.depthOk(e, p, e.getAttackRangeY()) && this.aabbX(box.x, box.w, pb.x, pb.w)) {
        const kb = (e.isBoss ? 30 : e.getBuild() === 'brute' ? 22 : 15) * PLAYER_KNOCKBACK_RESIST;
        const applied = p.takeDamage(e.getAttackDamage(), e.facing, kb);
        e.attackHitApplied = true;
        if (applied) {
          this.particles.burst(p.x, p.y - 60 * p.scale, '#ff3b5c', 14, { speed: 4 });
          this.audio.sfxPlayerHurt();
          this.addShake(e.isBoss ? 10 : 6, 240);
          this.freezeTime = Math.max(this.freezeTime, e.isBoss ? 120 : 70);
          this.combo = 0;
          p.invulnTimer = Math.max(p.invulnTimer, 380);
          if (!p.alive) this.onPlayerDeath();
        }
      }
    }
  }

  private handlePropCollisions() {
    const p = this.player;

    // Player melee vs props
    if (p.isStrikeActive) {
      const attackCfg = ATTACKS[p.currentAttackKind as keyof typeof ATTACKS] ?? ATTACKS.light;
      const range = attackCfg.range;
      const dmg = attackCfg.damage;
      const box = {
        x: p.x + (p.facing === 1 ? 20 * p.scale : -20 * p.scale - range * p.scale),
        w: range * p.scale,
      };
      for (const prop of this.props) {
        if (prop.destroyed) continue;
        if (Math.abs(prop.y - p.y) > 36) continue;
        const propBox = { x: prop.x - 20, w: 40 };
        if (this.aabbX(box.x, box.w, propBox.x, propBox.w)) {
          this.damageProp(prop, dmg);
          break;
        }
      }
    }

    // Projectiles vs props
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.owner !== 'player') continue;
      for (const prop of this.props) {
        if (prop.destroyed) continue;
        if (Math.abs(prop.y - pr.y) > 40) continue;
        if (Math.abs(prop.x - pr.x) < 22) {
          this.damageProp(prop, pr.damage);
          if (pr.type === 'grenade') this.explode(pr.x, pr.y, pr.damage, 'player');
          this.projectiles.splice(i, 1);
          break;
        }
      }
    }

    // Solid collision (player can't walk through intact props)
    for (const prop of this.props) {
      if (prop.destroyed) continue;
      const dx = p.x - prop.x;
      const dy = p.y - prop.y;
      if (Math.abs(dy) < 22 && Math.abs(dx) < 26) {
        p.x = prop.x + Math.sign(dx || 1) * 26;
      }
    }
  }

  private damageProp(prop: Prop, dmg: number) {
    if (prop.destroyed) return;
    prop.hp -= dmg;
    prop.hitFlash = 200;
    prop.shake = 120;
    this.particles.burst(prop.x, prop.y - 24, '#ffd23b', 6, { speed: 3 });
    this.audio.sfxHit(0.6);
    if (prop.hp <= 0) {
      prop.destroyed = true;
      prop.deathTimer = 400;
      this.particles.burst(prop.x, prop.y - 20, prop.kind === 'barrel' ? '#7a5a35' : '#a87a3a', 28, { speed: 5, size: 1.3 });
      this.particles.ring(prop.x, prop.y - 20, '#ffd23b', 1.2);
      this.audio.sfxEnemyDeath();
      this.addShake(4, 180);
      this.score += 50;
      this.particles.text(prop.x, prop.y - 50, '+50', '#ffd23b', 14);
      if (prop.contents) {
        this.pickups.push({ x: prop.x, y: prop.y, type: prop.contents, life: 11000, spin: 0 });
        this.particles.text(prop.x, prop.y - 70, '!', '#2bff7a', 22);
      }
    }
  }

  // Shared handler when an enemy dies (score, FX, drops).
  private onEnemyKilled(e: Enemy, mult: number, byExplosion = false) {
    const gained = Math.round(e.def.scoreValue * mult);
    this.score += gained;
    this.particles.text(e.x, e.y - 90 * e.scale, `+${gained}`, '#ffd23b', 18);
    this.particles.burst(e.x, e.y - 50 * e.scale, e.getPalette().body, byExplosion ? 22 : 28, { speed: byExplosion ? 5 : 6, size: 1.3 });
    this.particles.ring(e.x, e.y - 50 * e.scale, e.getPalette().accent, 1);
    this.audio.sfxEnemyDeath();
    this.addShake(e.isBoss ? 12 : 6, e.isBoss ? 400 : 240);
    if (e.isBoss) this.flashWhite = Math.max(this.flashWhite, 0.5);
    // Drops
    const dropBonus = e.isBoss ? 1 : 0;
    if (Math.random() < WEAPON_DROP_CHANCE + dropBonus) {
      const types: WeaponType[] = ['pistol', 'grenade', 'knife'];
      const t = types[Math.floor(Math.random() * types.length)];
      this.pickups.push({ x: e.x, y: e.y, type: t, life: 11000, spin: 0 });
    }
    if (Math.random() < PICKUP_DROP_CHANCE + (e.isBoss ? 1 : 0)) {
      this.pickups.push({ x: e.x + 20, y: e.y, type: 'heal', life: 11000, spin: 0 });
    }
  }

  private onPlayerDeath() {
    this.lives--;
    this.particles.burst(this.player.x, this.player.y - 50 * this.player.scale, '#2fe7ff', 24, { speed: 5 });
    if (this.lives > 0) {
      this.player.hp = this.player.maxHp;
      this.player.alive = true;
      this.player.x = CANVAS_WIDTH / 4;
      this.player.y = (GROUND_Y_MIN + GROUND_Y_MAX) / 2;
      this.player.invulnTimer = PLAYER_INVULN_RESPAWN;
      this.player.deathTimer = 0;
      this.player.knockX = 0;
      this.flashWhite = 0.5;
      this.particles.text(this.player.x, this.player.y - 120, `${this.lives} VIES RESTANTES`, '#2fe7ff', 18);
    } else {
      this.state = 'gameOver';
      this.audio.sfxGameOver();
    }
  }

  private addShake(mag: number, time: number) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  // ====== HUD ======
  private updateHud() {
    const p = this.player;
    this.hud.healthFill.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    this.hud.healthText.textContent = `${Math.ceil(p.hp)}`;
    this.hud.scoreEl.textContent = this.score.toLocaleString('fr-FR');
    this.hud.livesEl.textContent = '♥'.repeat(Math.max(0, this.lives));
    this.hud.levelEl.textContent = `${this.level.id}. ${this.level.name}`;
    this.hud.waveEl.textContent = `Vague ${Math.min(this.wavesSpawned, this.level.waves)}/${this.level.waves}`;
    if (this.combo >= 2) {
      this.hud.comboEl.textContent = `COMBO x${this.combo}`;
      this.hud.comboEl.style.opacity = '1';
    } else {
      this.hud.comboEl.style.opacity = '0';
    }
    const boss = this.enemies.find(e => e.isBoss && e.alive);
    if (boss) {
      this.hud.bossWrap.style.display = 'flex';
      this.hud.bossName.textContent = boss.def.name;
      this.hud.bossFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
    } else {
      this.hud.bossWrap.style.display = 'none';
    }
    // Weapons
      const weapons = p.getAllWeapons();
    if (weapons.length === 0) {
      this.hud.weaponsEl.innerHTML = '<span style="opacity:0.4;font-size:11px">AUCUNE ARME</span>';
    } else {
      this.hud.weaponsEl.innerHTML = weapons.map((w) => {
        const def = WEAPONS[w.type];
        const active = p.getCurrentWeapon() === w.type;
        return `<div class="ju-weapon ${active ? 'ju-weapon-active' : ''}" title="${def.name} (${w.qty})">
          <span class="ju-weapon-icon">${def.icon}</span>
          <span class="ju-weapon-ammo">${w.qty}</span>
        </div>`;
      }).join('');
    }
  }

  // ====== DRAW ======
  private draw() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shakeTime > 0) {
      const m = this.shakeMag * (this.shakeTime > 0 ? 1 : 0);
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    drawBackground(ctx, this.level.theme, this.bg, this.titleTime);
    if (this.state === 'title') {
      this.drawTitle();
      ctx.restore();
      return;
    }
    this.drawWorld();
    ctx.restore();

    if (this.flashWhite > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashWhite * 0.5})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    if (this.state === 'intro') this.drawIntro();
    else if (this.state === 'levelClear') this.drawLevelClear();
    else if (this.state === 'paused') this.drawPaused();
    else if (this.state === 'gameOver') this.drawGameOver();
    else if (this.state === 'victory') this.drawVictory();
  }

  private drawWorld() {
    const ctx = this.ctx;

    // GO indicator
    const aliveEnemies = this.enemies.filter(e => e.alive).length;
    const moreComing = aliveEnemies === 0 &&
      (this.wavesSpawned < this.level.waves || (this.level.hasBoss && !this.bossSpawned));
    if (moreComing && (Math.sin(this.goFlash / 120) > -0.3)) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = 'bold 44px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.level.theme.accent;
      ctx.shadowColor = this.level.theme.accent;
      ctx.shadowBlur = 24;
      const yo = Math.sin(this.goFlash / 150) * 6;
      ctx.fillText('GO ➔', CANVAS_WIDTH - 90, CANVAS_HEIGHT / 2 + yo);
      ctx.restore();
    }

    // Draw pickups
    for (const pk of this.pickups) {
      this.drawPickup(ctx, pk);
    }

    // Draw projectiles
    for (const pr of this.projectiles) {
      this.drawProjectile(ctx, pr);
    }

    // Telegraph: laser sight for snipers during windup, throw arc for thrower
    for (const e of this.enemies) {
      if (!e.alive || !e.def.ranged) continue;
      if (e.attackPhase !== 'windup') continue;
      const sx = e.x + e.facing * 20;
      const sy = e.y - 50 * e.scale;
      if (e.def.key === 'sniper') {
        // pulsing red laser line to player
        const dxp = this.player.x - sx;
        const dyp = (this.player.y - 50 * this.player.scale) - sy;
        const dist = Math.hypot(dxp, dyp);
        const pulse = 0.5 + Math.sin(this.titleTime / 50) * 0.5;
        ctx.save();
        ctx.globalAlpha = 0.35 + pulse * 0.45;
        ctx.strokeStyle = '#ff3b5c';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = '#ff3b5c';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + dxp, sy + dyp);
        ctx.stroke();
        // dot on player
        ctx.fillStyle = '#ff3b5c';
        ctx.beginPath();
        ctx.arc(sx + dxp, sy + dyp, 3 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        void dist;
      } else if (e.def.key === 'archer') {
        // dim aim line
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = e.getPalette().accent;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(this.player.x, this.player.y - 50 * this.player.scale);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      } else if (e.def.key === 'thrower') {
        // parabolic preview
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#ff3b5c';
        const dxp = this.player.x - sx;
        const dyp = this.player.y - sy;
        const d = Math.hypot(dxp, dyp) || 1;
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const px = sx + (dxp / d) * (e.def.projectileSpeed ?? 5) * t * 18;
          const py = sy + (dyp / d) * (e.def.projectileSpeed ?? 5) * 0.4 * t * 18 + 0.08 * (t * 18) * (t * 18);
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Rage aura when combo is high
    if (this.combo >= 5 && this.player.alive) {
      const p = this.player;
      const intensity = Math.min(1, (this.combo - 5) / 8);
      const radius = (60 + intensity * 30) * p.scale;
      const pulse = 0.5 + Math.sin(this.titleTime / 80) * 0.5;
      const auraColor = this.combo >= 10 ? '#ff3b8a' : '#ffd23b';
      ctx.save();
      const aura = ctx.createRadialGradient(p.x, p.y - 50 * p.scale, 5, p.x, p.y - 50 * p.scale, radius);
      aura.addColorStop(0, `rgba(255,255,255,${0.15 + pulse * 0.15})`);
      aura.addColorStop(0.5, `${auraColor}40`);
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(p.x - radius, p.y - 50 * p.scale - radius, radius * 2, radius * 2);
      ctx.restore();
      // sparks around player
      if (Math.random() < 0.4 * intensity) {
        const a = Math.random() * Math.PI * 2;
        const r = 30 * p.scale + Math.random() * 20;
        this.particles.burst(p.x + Math.cos(a) * r, p.y - 50 * p.scale + Math.sin(a) * r, auraColor, 1, { speed: 1.5, gravity: -0.05, size: 0.6 });
      }
    }

    // Render fighters + props together, sorted by depth (Y)
    type Renderable = { y: number; draw: () => void };
    const renderables: Renderable[] = [];
    for (const f of [this.player, ...this.enemies]) {
      renderables.push({ y: f.y, draw: () => f.draw(ctx) });
    }
    for (const pr of this.props) {
      renderables.push({ y: pr.y, draw: () => drawProp(ctx, pr, 1) });
    }
    renderables.sort((a, b) => a.y - b.y);
    for (const r of renderables) r.draw();

    // Slash arc trail during player strike phase
    if (this.player.isStrikeActive) {
      const p = this.player;
      const reach = p.getAttackRangeX() * p.scale * 0.9;
      const baseY = p.y - 60 * p.scale;
      const cx = p.x + p.facing * 6;
      ctx.save();
      ctx.translate(cx, baseY);
      ctx.scale(p.facing, 1);
      const trailColor = p.currentAttackKind === 'special' ? '#ff3b8a'
                       : p.currentAttackKind === 'heavy' ? '#ffd23b'
                       : p.currentAttackKind === 'uppercut' ? '#2bff7a'
                       : '#2fe7ff';
      ctx.strokeStyle = trailColor;
      ctx.shadowColor = trailColor;
      ctx.shadowBlur = 14;
      ctx.lineCap = 'round';
      // 3 fading arcs to create motion blur
      for (let k = 0; k < 3; k++) {
        const a = 0.55 - k * 0.18;
        ctx.globalAlpha = a;
        ctx.lineWidth = (5 - k) * p.scale;
        ctx.beginPath();
        const angOff = -0.5 + k * 0.18;
        const startA = -0.6 + angOff;
        const endA = 0.6 + angOff;
        ctx.arc(0, 0, reach, startA, endA);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Enemy health bars
    for (const e of this.enemies) {
      if (!e.alive || e.hp >= e.maxHp || e.isBoss) continue;
      const w = 44 * e.scale;
      const x = e.x - w / 2;
      const y = e.y - 128 * e.scale * e.getSizeMult();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, w, 5);
      ctx.fillStyle = e.getPalette().body;
      ctx.fillRect(x, y, w * (e.hp / e.maxHp), 5);
    }

    this.particles.draw(ctx);
  }

  private drawPickup(ctx: CanvasRenderingContext2D, pk: WeaponPickup) {
    const blink = pk.life < 2500 ? (Math.sin(pk.life / 80) > 0 ? 1 : 0.3) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.translate(pk.x, pk.y - 16 + Math.sin(pk.spin * 3) * 3);
    ctx.rotate(pk.spin);
    if (pk.type === 'heal') {
      ctx.fillStyle = '#2bff7a';
      ctx.shadowColor = '#2bff7a';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(12, 0); ctx.lineTo(0, 14); ctx.lineTo(-12, 0); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#06280f';
      ctx.fillRect(-2.5, -8, 5, 16);
      ctx.fillRect(-8, -2.5, 16, 5);
    } else {
      const def = WEAPONS[pk.type];
      ctx.fillStyle = def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.rect(-14, -10, 28, 20);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px "Courier New"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 0;
      ctx.fillText(def.icon, 0, 0);
    }
    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, pr: Projectile) {
    const color = WEAPONS[pr.type].color;
    const renderY = pr.y - pr.z; // grenades arc upward (z = height)

    if (pr.type === 'grenade') {
      // Ground shadow that shrinks as the grenade rises
      ctx.save();
      ctx.globalAlpha = Math.max(0.12, 0.45 - pr.z * 0.004);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(pr.x, pr.y + 2, Math.max(3, 10 - pr.z * 0.03), Math.max(2, 4 - pr.z * 0.012), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(pr.x, renderY);
      ctx.rotate(pr.rot);
      // Body
      const grad = ctx.createRadialGradient(-3, -3, 1, 0, 0, 9);
      grad.addColorStop(0, '#5a5a62');
      grad.addColorStop(1, '#1c1c22');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#0a0a0e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Segmentation line
      ctx.strokeStyle = '#0a0a0e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-9, 0); ctx.lineTo(9, 0);
      ctx.stroke();
      // Top cap
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(-3, -12, 6, 4);
      // Blinking fuse spark — speeds up as fuse runs out
      const fuseFrac = Math.max(0, Math.min(1, pr.fuse / 1400));
      const sparkRate = 0.4 + (1 - fuseFrac) * 1.6;
      if (Math.sin(pr.born * 0.03 * sparkRate) > 0) {
        ctx.fillStyle = '#fff5b0';
        ctx.shadowColor = '#ffd23b';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(0, -13, 2.6 + Math.random() * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff8a3b';
        ctx.beginPath();
        ctx.arc(0, -13, 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(pr.x, renderY);
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    if (pr.type === 'pistol') {
      // Energy tracer: bright head + fading streak
      const ang = Math.atan2(pr.vy, pr.vx);
      ctx.rotate(ang);
      // streak
      const streakGrad = ctx.createLinearGradient(-26, 0, 6, 0);
      streakGrad.addColorStop(0, 'rgba(255,210,59,0)');
      streakGrad.addColorStop(1, color);
      ctx.fillStyle = streakGrad;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-26, 3);
      ctx.lineTo(-26, -3);
      ctx.closePath();
      ctx.fill();
      // head
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (pr.type === 'knife') {
      // Spinning throwing knife
      ctx.rotate(pr.rot);
      // blade
      ctx.fillStyle = '#dfe9ff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(-12, -3);
      ctx.lineTo(-14, 0);
      ctx.lineTo(-12, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // glow edge
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(2, 0); ctx.lineTo(-12, -3);
      ctx.stroke();
      // handle
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(2, -1.6, 6, 3.2);
    }
    ctx.restore();
  }

  // ====== MENU SCREENS ======
  private neonText(text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center') {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.25;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawTitle() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5,5,15,0.55)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const t = this.titleTime / 1000;
    const bob = Math.sin(t * 1.6) * 6;
    this.neonText('JUSTICE', CANVAS_WIDTH / 2, 150 + bob, 78, '#2fe7ff');
    this.neonText('URBAINE', CANVAS_WIDTH / 2, 226 + bob, 78, '#ff3b8a');
    this.neonText('Beat \'em up néon 2.5D · 5 niveaux · arsenal complet', CANVAS_WIDTH / 2, 280, 18, '#ffd23b');
    if (Math.sin(t * 4) > -0.4) {
      this.neonText('▸ ESPACE / CLIC pour jouer ◂', CANVAS_WIDTH / 2, 350, 26, '#ffffff');
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fb3d1';
    ctx.font = '13px "Courier New", monospace';
    ctx.fillText('ZQSD : déplacer    ESPACE : poing    SHIFT : coup lourd    F : tirer    Q/E : changer d\'arme', CANVAS_WIDTH / 2, 400);
    ctx.fillText('SHIFT + direction : dash (invulnérabilité)    P : pause', CANVAS_WIDTH / 2, 420);
    ctx.fillText('Combos · 4 attaques · pistolet/grenade/couteau · 7 types d\'ennemis · boss final', CANVAS_WIDTH / 2, 442);
    this.neonText('par Hylst — Geoffroy, avec l\'aide d\'une IA', CANVAS_WIDTH / 2, 500, 18, '#41e8c8');
    ctx.textAlign = 'left';
  }

  private drawIntro() {
    const ctx = this.ctx;
    const t = 1 - this.introTimer / 2800;
    const ease = t < 0.15 ? t / 0.15 : t > 0.9 ? (1 - t) / 0.1 : 1;
    ctx.fillStyle = `rgba(5,5,15,${0.55 * ease})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.globalAlpha = ease;
    this.neonText(`NIVEAU ${this.level.id}`, CANVAS_WIDTH / 2, 220, 40, this.level.theme.accent);
    this.neonText(this.level.name, CANVAS_WIDTH / 2, 280, 54, '#ffffff');
    ctx.fillStyle = '#ffd23b';
    ctx.font = '20px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.level.subtitle, CANVAS_WIDTH / 2, 322);
    ctx.fillStyle = '#9fb3d1';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText(`${this.level.waves} vagues${this.level.hasBoss ? '  ·  ⚠ BOSS FINAL' : ''}`, CANVAS_WIDTH / 2, 360);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  private drawLevelClear() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5,5,15,0.45)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.neonText('NIVEAU TERMINÉ', CANVAS_WIDTH / 2, 250, 48, '#2bff7a');
    ctx.fillStyle = '#ffd23b';
    ctx.font = '22px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Score : ${this.score.toLocaleString('fr-FR')}    Meilleur combo : x${this.bestCombo}`, CANVAS_WIDTH / 2, 305);
    ctx.textAlign = 'left';
  }

  private drawPaused() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5,5,15,0.82)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const panelX = 86;
    const panelY = 86;
    const panelW = CANVAS_WIDTH - 172;
    const panelH = CANVAS_HEIGHT - 150;
    ctx.save();
    ctx.fillStyle = 'rgba(8,12,28,0.86)';
    ctx.strokeStyle = '#2fe7ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#2fe7ff';
    ctx.shadowBlur = 18;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeRect(panelX, panelY, panelW, panelH);
    ctx.restore();

    this.neonText('PAUSE TACTIQUE', CANVAS_WIDTH / 2, 138, 42, '#2fe7ff');
    const weapons = this.player.getAllWeapons();
    const weaponText = weapons.length
      ? weapons.map(w => `${WEAPONS[w.type].name}:${w.qty}`).join('  ')
      : 'Aucune arme';

    const left = panelX + 44;
    const mid = panelX + panelW * 0.49;
    const right = panelX + panelW - 44;
    const top = panelY + 98;

    const header = (text: string, x: number, y: number, color = '#ffd23b') => {
      ctx.fillStyle = color;
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillText(text, x, y);
    };
    const line = (text: string, x: number, y: number, color = '#cfe3ff') => {
      ctx.fillStyle = color;
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText(text, x, y);
    };

    ctx.textAlign = 'left';
    header('STATS', left, top);
    line(`Niveau : ${this.level.id}/${LEVELS.length} - ${this.level.name}`, left, top + 28);
    line(`Vague : ${Math.min(this.wavesSpawned, this.level.waves)}/${this.level.waves}`, left, top + 50);
    line(`Score : ${this.score.toLocaleString('fr-FR')}`, left, top + 72);
    line(`Meilleur combo : x${this.bestCombo}`, left, top + 94);
    line(`Vies : ${this.lives}   PV : ${Math.ceil(this.player.hp)}/${this.player.maxHp}`, left, top + 116);
    line(`Arsenal : ${weaponText}`, left, top + 138, '#ffd23b');

    header('CONTRÔLES', mid, top);
    line('ZQSD / Flèches : déplacement 8 directions', mid, top + 28);
    line('ESPACE / J : combo de poings', mid, top + 50);
    line('SHIFT : coup lourd  |  SHIFT + direction : dash', mid, top + 72);
    line('F : tirer / lancer arme équipée', mid, top + 94);
    line('Q / E : changer d\'arme', mid, top + 116);
    line('P ou Échap : reprendre', mid, top + 138);

    header('INFOS MISSION', left, top + 190, '#2bff7a');
    line('Objectif : vider chaque zone, suivre le GO, survivre jusqu\'à la Tour du Syndicat.', left, top + 218);
    line('Les grenades suivent une trajectoire balistique : viser la profondeur compte autant que la distance.', left, top + 240);
    line('Caisses et tonneaux peuvent contenir soins, pistolets, grenades ou couteaux.', left, top + 262);

    ctx.textAlign = 'right';
    header('ACTIONS', right - 190, top + 190, '#ff3b8a');
    line('P : reprendre', right, top + 218, '#ffffff');
    line('R : recommencer la partie', right, top + 240, '#ffb6d0');
    line('Objectif actuel : ' + this.level.subtitle, right, top + 262, '#cfe3ff');

    ctx.textAlign = 'center';
    ctx.fillStyle = '#2fe7ff';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText('P POUR REPRENDRE    |    R POUR RECOMMENCER', CANVAS_WIDTH / 2, panelY + panelH - 28);
    ctx.textAlign = 'left';
  }

  private drawGameOver() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(20,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const wobble = Math.sin(this.titleTime / 200) * 2;
    this.neonText('GAME OVER', CANVAS_WIDTH / 2, 230 + wobble, 70, '#ff3b5c');
    ctx.fillStyle = '#ffd23b';
    ctx.font = '24px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Score final : ${this.score.toLocaleString('fr-FR')}`, CANVAS_WIDTH / 2, 300);
    ctx.fillStyle = '#9fb3d1';
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText('ESPACE / R / CLIC pour revenir au menu', CANVAS_WIDTH / 2, 360);
    ctx.textAlign = 'left';
  }

  private drawVictory() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,10,5,0.6)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (Math.random() < 0.4) {
      const cols = ['#ffd23b', '#2fe7ff', '#ff3b8a', '#2bff7a'];
      this.particles.burst(Math.random() * CANVAS_WIDTH, Math.random() * 300 + 60, cols[Math.floor(Math.random() * 4)], 10, { speed: 4, size: 1.2 });
    }
    this.particles.draw(ctx);
    const bob = Math.sin(this.titleTime / 300) * 6;
    this.neonText('VICTOIRE !', CANVAS_WIDTH / 2, 220 + bob, 72, '#2bff7a');
    ctx.fillStyle = '#ffd23b';
    ctx.font = '24px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`La ville est libérée. Score : ${this.score.toLocaleString('fr-FR')}`, CANVAS_WIDTH / 2, 300);
    ctx.fillStyle = '#9fb3d1';
    ctx.font = '18px "Courier New", monospace';
    ctx.fillText('Meilleur combo : x' + this.bestCombo, CANVAS_WIDTH / 2, 332);
    ctx.fillText('ESPACE / R / CLIC pour rejouer', CANVAS_WIDTH / 2, 380);
    ctx.textAlign = 'left';
  }

  // ====== LOOP ======
  private loop = (ts: number) => {
    if (!this.running) return;
    const dt = Math.min(40, ts - this.lastTime || 16);
    this.lastTime = ts;
    this.update(dt);
    this.draw();
    this.input.endFrame();
    this.animId = requestAnimationFrame(this.loop);
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.animId = requestAnimationFrame(this.loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.animId);
    this.input.destroy();
  }
}
