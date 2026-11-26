// ====== CORE DIMENSIONS ======
export const CANVAS_WIDTH = 1024;
export const CANVAS_HEIGHT = 576;

// Ground plane (2.5D depth)
export const GROUND_Y_MIN = 332;
export const GROUND_Y_MAX = 542;
export const GROUND_DEPTH_RANGE = GROUND_Y_MAX - GROUND_Y_MIN;

export const depthScale = (y: number): number => {
  const t = (y - GROUND_Y_MIN) / GROUND_DEPTH_RANGE;
  return 0.62 + t * 0.5;
};

// ====== PLAYER ======
export const PLAYER_SPEED = 3.8;
export const PLAYER_MAX_HP = 120;
export const PLAYER_START_LIVES = 3;
export const PLAYER_ATTACK_DAMAGE = 18;
export const PLAYER_HEAVY_DAMAGE = 32;
export const PLAYER_SPECIAL_DAMAGE = 50;
export const PLAYER_ATTACK_RANGE_X = 72;
export const PLAYER_HEAVY_RANGE_X = 88;
export const PLAYER_SPECIAL_RANGE_X = 120;
export const PLAYER_ATTACK_RANGE_Y = 32;
export const PLAYER_INVULN_RESPAWN = 1500;
export const PLAYER_KNOCKBACK_RESIST = 0.65;

// ====== ATTACK TIMINGS ======
export const ATTACKS = {
  light: { windup: 80, strike: 100, recover: 140, cooldown: 220, damage: 18, range: 72, knockback: 14 },
  heavy: { windup: 180, strike: 150, recover: 280, cooldown: 650, damage: 32, range: 88, knockback: 24 },
  special: { windup: 280, strike: 200, recover: 400, cooldown: 1400, damage: 50, range: 120, knockback: 38 },
  uppercut: { windup: 120, strike: 180, recover: 200, cooldown: 450, damage: 28, range: 80, knockback: 30 },
};

// ====== WEAPONS ======
export type WeaponType = 'pistol' | 'grenade' | 'knife';
export type PickupType = WeaponType | 'heal';

export interface WeaponDef {
  type: WeaponType;
  name: string;
  ammo: number;
  damage: number;
  speed: number;
  range: number;
  cooldown: number;
  color: string;
  icon: string;
}

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  pistol: { type: 'pistol', name: 'PISTOLET', ammo: 8, damage: 35, speed: 12, range: 800, cooldown: 280, color: '#ffd23b', icon: '🔫' },
  grenade: { type: 'grenade', name: 'GRENADE', ammo: 3, damage: 60, speed: 6, range: 400, cooldown: 900, color: '#ff3b5c', icon: '💣' },
  knife: { type: 'knife', name: 'COUTEAU', ammo: 5, damage: 28, speed: 9, range: 300, cooldown: 450, color: '#2fe7ff', icon: '🗡️' },
};

export interface WeaponPickup {
  x: number;
  y: number;
  type: PickupType;
  life: number;
  spin: number;
}

export interface Projectile {
  x: number;          // screen X
  y: number;          // ground depth (Y)
  vx: number;         // horizontal velocity
  vy: number;         // depth velocity
  z: number;          // height above the ground (for arc visualization)
  vz: number;         // vertical velocity (arc)
  damage: number;
  type: WeaponType;
  life: number;
  fuse: number;       // grenade fuse (ms) — explodes when <= 0
  owner: 'player' | 'enemy';
  rot: number;        // spin angle
  vrot: number;       // spin speed
  bounces: number;    // ground bounce counter (grenade)
  pierceLeft: number; // remaining pierces (knife)
  hits: unknown[];    // entities already hit (avoids double hits / for pierce)
  born: number;       // age in ms
}

// ====== COMBO ======
export const COMBO_WINDOW = 1600;
export const PICKUP_HEAL = 30;
export const PICKUP_DROP_CHANCE = 0.18;
export const WEAPON_DROP_CHANCE = 0.22;

// ====== ENEMY TYPES ======
export type EnemyBuild = 'thug' | 'runner' | 'brute' | 'archer' | 'sniper' | 'thrower' | 'boss';

export interface Palette {
  body: string;
  bodyDark: string;
  accent: string;
  limb: string;
  limbDark: string;
  trim: string;
  glow?: string;
}

export interface EnemyTypeDef {
  key: EnemyBuild;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  scoreValue: number;
  sizeMult: number;
  windup: number;
  strike: number;
  recover: number;
  cooldownMin: number;
  cooldownMax: number;
  rangeX: number;
  rangeY: number;
  palette: Palette;
  ranged?: boolean;
  projectileSpeed?: number;
}

export const PLAYER_PALETTE: Palette = {
  body: '#2fe7ff',
  bodyDark: '#0a7e9c',
  accent: '#eafffd',
  limb: '#1bb6d6',
  limbDark: '#0a5f76',
  trim: '#06343f',
  glow: '#2fe7ff',
};

export const ENEMY_TYPES: Record<EnemyBuild, EnemyTypeDef> = {
  thug: {
    key: 'thug', name: 'Voyou', hp: 42, speed: 1.45, damage: 7, scoreValue: 100, sizeMult: 1.0,
    windup: 350, strike: 130, recover: 380, cooldownMin: 950, cooldownMax: 1750,
    rangeX: 58, rangeY: 28, palette: {
      body: '#ff3b5c', bodyDark: '#9c1230', accent: '#ffd23b', limb: '#d11f3e', limbDark: '#700d20', trim: '#3e0813',
    },
  },
  runner: {
    key: 'runner', name: 'Coureur', hp: 26, speed: 2.35, damage: 5, scoreValue: 130, sizeMult: 0.86,
    windup: 230, strike: 105, recover: 290, cooldownMin: 700, cooldownMax: 1250,
    rangeX: 52, rangeY: 26, palette: {
      body: '#ffb02e', bodyDark: '#a86500', accent: '#fff39b', limb: '#e08800', limbDark: '#744400', trim: '#3e2600',
    },
  },
  brute: {
    key: 'brute', name: 'Brute', hp: 95, speed: 1.0, damage: 13, scoreValue: 220, sizeMult: 1.36,
    windup: 520, strike: 165, recover: 540, cooldownMin: 1250, cooldownMax: 2050,
    rangeX: 70, rangeY: 32, palette: {
      body: '#9b5cff', bodyDark: '#551ba8', accent: '#41e8c8', limb: '#7a32e0', limbDark: '#451a86', trim: '#27104c',
    },
  },
  archer: {
    key: 'archer', name: 'Archer', hp: 38, speed: 1.2, damage: 9, scoreValue: 180, sizeMult: 1.0,
    windup: 420, strike: 200, recover: 380, cooldownMin: 1400, cooldownMax: 2200,
    rangeX: 280, rangeY: 22, ranged: true, projectileSpeed: 7, palette: {
      body: '#41e8c8', bodyDark: '#1a7a5e', accent: '#ffd23b', limb: '#2bb095', limbDark: '#155040', trim: '#0a2a20',
    },
  },
  sniper: {
    key: 'sniper', name: 'Sniper', hp: 32, speed: 0.9, damage: 18, scoreValue: 240, sizeMult: 1.1,
    windup: 680, strike: 250, recover: 520, cooldownMin: 1800, cooldownMax: 2800,
    rangeX: 400, rangeY: 18, ranged: true, projectileSpeed: 14, palette: {
      body: '#ff6b3b', bodyDark: '#a83a1a', accent: '#2fe7ff', limb: '#d4502a', limbDark: '#701e0f', trim: '#3a0f05',
    },
  },
  thrower: {
    key: 'thrower', name: 'Lanceur', hp: 48, speed: 1.3, damage: 11, scoreValue: 200, sizeMult: 1.05,
    windup: 380, strike: 180, recover: 360, cooldownMin: 1200, cooldownMax: 1900,
    rangeX: 220, rangeY: 25, ranged: true, projectileSpeed: 5, palette: {
      body: '#ff3b8a', bodyDark: '#9c1a4a', accent: '#ffd23b', limb: '#d42a6e', limbDark: '#70163a', trim: '#3a0a1e',
    },
  },
  boss: {
    key: 'boss', name: 'LE PATRON', hp: 520, speed: 1.15, damage: 19, scoreValue: 1800, sizeMult: 1.85,
    windup: 560, strike: 230, recover: 680, cooldownMin: 1400, cooldownMax: 2200,
    rangeX: 104, rangeY: 42, palette: {
      body: '#2bd97a', bodyDark: '#0f7038', accent: '#ff3b5c', limb: '#1ba858', limbDark: '#0a542a', trim: '#053018',
      glow: '#2bd97a',
    },
  },
};

// ====== LEVELS ======
export interface ThemeColors {
  skyTop: string;
  skyBottom: string;
  groundTop: string;
  groundBottom: string;
  gridColor: string;
  buildingFar: string;
  buildingNear: string;
  windowA: string;
  windowB: string;
  fog: string;
  accent: string;
  weather: 'clear' | 'rain' | 'snow' | 'embers';
  neonSigns?: { x: number; y: number; text: string; color: string }[];
}

export interface MusicConfig {
  tempo: number;
  root: number;
  scale: number[];
}

export interface LevelConfig {
  id: number;
  name: string;
  subtitle: string;
  waves: number;
  perWaveMin: number;
  perWaveMax: number;
  enemyMix: EnemyBuild[];
  hpMult: number;
  speedMult: number;
  damageMult: number;
  hasBoss: boolean;
  theme: ThemeColors;
  music: MusicConfig;
}

export const LEVELS: LevelConfig[] = [
  {
    id: 1, name: 'QUARTIER EST', subtitle: 'Les rues ne dorment jamais.',
    waves: 3, perWaveMin: 2, perWaveMax: 3, enemyMix: ['thug'],
    hpMult: 1.0, speedMult: 1.0, damageMult: 1.0, hasBoss: false,
    theme: {
      skyTop: '#0a1030', skyBottom: '#1c2a5e', groundTop: '#0c1230', groundBottom: '#04060f',
      gridColor: '#2e6bff', buildingFar: '#0a1230', buildingNear: '#111a3a',
      windowA: '#ffd23b', windowB: '#29e6ff', fog: 'rgba(40,80,180,0.10)', accent: '#29e6ff', weather: 'clear',
      neonSigns: [
        { x: 120, y: 180, text: 'BAR', color: '#ff3b8a' },
        { x: 680, y: 160, text: 'HOTEL', color: '#2fe7ff' },
      ],
    },
    music: { tempo: 112, root: 45, scale: [0, 2, 3, 5, 7, 8, 10] },
  },
  {
    id: 2, name: 'RUELLE SOMBRE', subtitle: 'Chaque angle cache une embuscade.',
    waves: 3, perWaveMin: 3, perWaveMax: 3, enemyMix: ['thug', 'runner', 'archer'],
    hpMult: 1.15, speedMult: 1.1, damageMult: 1.1, hasBoss: false,
    theme: {
      skyTop: '#1a0b2e', skyBottom: '#3a0f3e', groundTop: '#150826', groundBottom: '#07030d',
      gridColor: '#ff3b8a', buildingFar: '#140722', buildingNear: '#220a30',
      windowA: '#ff3b8a', windowB: '#9b5cff', fog: 'rgba(180,40,120,0.12)', accent: '#ff3b8a', weather: 'rain',
      neonSigns: [
        { x: 200, y: 140, text: 'CLUB', color: '#ff3b8a' },
        { x: 820, y: 200, text: '24H', color: '#2bff7a' },
      ],
    },
    music: { tempo: 120, root: 43, scale: [0, 3, 5, 7, 10] },
  },
  {
    id: 3, name: 'PORT INDUSTRIEL', subtitle: 'Le métal et la brume.',
    waves: 4, perWaveMin: 3, perWaveMax: 3, enemyMix: ['thug', 'brute', 'archer'],
    hpMult: 1.3, speedMult: 1.05, damageMult: 1.25, hasBoss: false,
    theme: {
      skyTop: '#062a2e', skyBottom: '#0a4a48', groundTop: '#06222a', groundBottom: '#02100f',
      gridColor: '#29e6c0', buildingFar: '#04181c', buildingNear: '#062a2c',
      windowA: '#29e6c0', windowB: '#ffd23b', fog: 'rgba(40,200,180,0.15)', accent: '#29e6c0', weather: 'clear',
      neonSigns: [
        { x: 150, y: 170, text: 'PORT', color: '#29e6c0' },
        { x: 750, y: 150, text: 'ZONE', color: '#ff3b5c' },
      ],
    },
    music: { tempo: 104, root: 41, scale: [0, 2, 3, 5, 7, 9, 10] },
  },
  {
    id: 4, name: 'AUTOROUTE URBAINE', subtitle: 'Pleine vitesse vers la justice.',
    waves: 4, perWaveMin: 3, perWaveMax: 4, enemyMix: ['thug', 'runner', 'brute', 'sniper'],
    hpMult: 1.5, speedMult: 1.15, damageMult: 1.4, hasBoss: false,
    theme: {
      skyTop: '#3a1206', skyBottom: '#7a2e0a', groundTop: '#2a0e04', groundBottom: '#0a0301',
      gridColor: '#ffae3b', buildingFar: '#240a02', buildingNear: '#3a1206',
      windowA: '#ffae3b', windowB: '#ff5a3b', fog: 'rgba(200,100,40,0.12)', accent: '#ff8a3b', weather: 'embers',
      neonSigns: [
        { x: 100, y: 160, text: 'SPEED', color: '#ffae3b' },
        { x: 900, y: 180, text: 'EXIT', color: '#2fe7ff' },
      ],
    },
    music: { tempo: 128, root: 40, scale: [0, 3, 5, 7, 10] },
  },
  {
    id: 5, name: 'LE SANCTUAIRE', subtitle: 'Le cœur du syndicat.',
    waves: 3, perWaveMin: 2, perWaveMax: 3, enemyMix: ['thug', 'brute', 'thrower', 'sniper'],
    hpMult: 1.7, speedMult: 1.2, damageMult: 1.6, hasBoss: true,
    theme: {
      skyTop: '#0a1a0e', skyBottom: '#143a1c', groundTop: '#08160a', groundBottom: '#020804',
      gridColor: '#2bff7a', buildingFar: '#04140a', buildingNear: '#082012',
      windowA: '#2bff7a', windowB: '#9b5cff', fog: 'rgba(40,200,120,0.15)', accent: '#2bff7a', weather: 'clear',
      neonSigns: [
        { x: 180, y: 150, text: 'BASE', color: '#2bff7a' },
        { x: 840, y: 170, text: 'ZONE X', color: '#ff3b5c' },
      ],
    },
    music: { tempo: 96, root: 38, scale: [0, 2, 3, 5, 7, 8, 10] },
  },
  {
    id: 6, name: 'MÉTRO FANTÔME', subtitle: 'Sous la ville, les rails grondent encore.',
    waves: 4, perWaveMin: 3, perWaveMax: 4, enemyMix: ['runner', 'archer', 'thrower'],
    hpMult: 1.85, speedMult: 1.28, damageMult: 1.75, hasBoss: false,
    theme: {
      skyTop: '#06101a', skyBottom: '#10263a', groundTop: '#071522', groundBottom: '#02070c',
      gridColor: '#29e6ff', buildingFar: '#06111d', buildingNear: '#0a1c2e',
      windowA: '#29e6ff', windowB: '#ffd23b', fog: 'rgba(30,160,220,0.16)', accent: '#29e6ff', weather: 'snow',
      neonSigns: [
        { x: 120, y: 145, text: 'METRO', color: '#29e6ff' },
        { x: 760, y: 195, text: 'LIGNE 9', color: '#ffd23b' },
      ],
    },
    music: { tempo: 116, root: 36, scale: [0, 2, 3, 6, 7, 10] },
  },
  {
    id: 7, name: 'TOITS DE VERRE', subtitle: 'La justice grimpe au-dessus des enseignes.',
    waves: 5, perWaveMin: 3, perWaveMax: 4, enemyMix: ['runner', 'sniper', 'brute', 'archer'],
    hpMult: 2.05, speedMult: 1.34, damageMult: 1.9, hasBoss: false,
    theme: {
      skyTop: '#120625', skyBottom: '#2a0c48', groundTop: '#10051f', groundBottom: '#03010a',
      gridColor: '#c95cff', buildingFar: '#0d0618', buildingNear: '#18082b',
      windowA: '#c95cff', windowB: '#2fe7ff', fog: 'rgba(160,70,255,0.13)', accent: '#c95cff', weather: 'rain',
      neonSigns: [
        { x: 210, y: 135, text: 'SKY', color: '#c95cff' },
        { x: 650, y: 165, text: 'ROOF', color: '#2fe7ff' },
      ],
    },
    music: { tempo: 132, root: 42, scale: [0, 1, 3, 5, 7, 8, 10] },
  },
  {
    id: 8, name: 'TOUR DU SYNDICAT', subtitle: 'Dernier étage. Dernier verdict.',
    waves: 5, perWaveMin: 4, perWaveMax: 5, enemyMix: ['thug', 'runner', 'brute', 'thrower', 'sniper'],
    hpMult: 2.35, speedMult: 1.42, damageMult: 2.15, hasBoss: true,
    theme: {
      skyTop: '#05050b', skyBottom: '#17111f', groundTop: '#080810', groundBottom: '#010104',
      gridColor: '#ff3b5c', buildingFar: '#050508', buildingNear: '#111018',
      windowA: '#ff3b5c', windowB: '#2bff7a', fog: 'rgba(255,40,90,0.14)', accent: '#ff3b5c', weather: 'embers',
      neonSigns: [
        { x: 160, y: 150, text: 'JUSTICE', color: '#ff3b5c' },
        { x: 820, y: 170, text: 'FINAL', color: '#2bff7a' },
      ],
    },
    music: { tempo: 140, root: 34, scale: [0, 3, 5, 6, 7, 10] },
  },
];
