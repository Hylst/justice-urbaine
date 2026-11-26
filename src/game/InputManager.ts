// Input manager - tracks keyboard + mouse state
export class InputManager {
  private keys: Set<string> = new Set();
  private justPressed: Set<string> = new Set();
  private clickQueued = false;

  // virtual touch input (for mobile)
  private touchMove = { x: 0, y: 0 };
  private touchAttack = false;
  private touchAttackQueued = false;
  // buffered actions (heavy/shoot)
  private heavyQueued = false;
  private shootQueued = false;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  private handleKeyDown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
      e.preventDefault();
    }
    if (!this.keys.has(key)) this.justPressed.add(key);
    this.keys.add(key);
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keys.delete(e.key.toLowerCase());
  }

  private handleBlur() {
    this.keys.clear();
  }

  isDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }
  wasPressed(key: string): boolean {
    return this.justPressed.has(key.toLowerCase());
  }
  consumeClick(): boolean {
    if (this.clickQueued) { this.clickQueued = false; return true; }
    return false;
  }
  queueClick() { this.clickQueued = true; }

  endFrame() {
    this.justPressed.clear();
    this.touchAttackQueued = false;
    this.clickQueued = false;
  }

  getMovement(): { dx: number; dy: number } {
    let dx = 0, dy = 0;
    if (this.isDown('arrowleft') || this.isDown('q') || this.isDown('a')) dx -= 1;
    if (this.isDown('arrowright') || this.isDown('d')) dx += 1;
    if (this.isDown('arrowup') || this.isDown('z') || this.isDown('w')) dy -= 1;
    if (this.isDown('arrowdown') || this.isDown('s')) dy += 1;
    // touch override
    if (this.touchMove.x !== 0 || this.touchMove.y !== 0) {
      dx = this.touchMove.x; dy = this.touchMove.y;
    }
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    return { dx, dy };
  }

  attackPressed(): boolean {
    return this.wasPressed(' ') || this.isDown('j') || this.touchAttackQueued || this.touchAttack;
  }
  pausePressed(): boolean {
    return this.wasPressed('p') || this.wasPressed('escape');
  }
  confirmPressed(): boolean {
    return this.wasPressed(' ') || this.wasPressed('enter');
  }

  // touch controls (driven by DOM overlay)
  setTouchMove(x: number, y: number) { this.touchMove.x = x; this.touchMove.y = y; }
  setTouchAttack(down: boolean) {
    if (down && !this.touchAttack) this.touchAttackQueued = true;
    this.touchAttack = down;
  }

  // Heavy/shoot queued actions
  queueHeavy() { this.heavyQueued = true; }
  consumeHeavy(): boolean {
    if (this.heavyQueued) { this.heavyQueued = false; return true; }
    return false;
  }
  queueShoot() { this.shootQueued = true; }
  consumeShoot(): boolean {
    if (this.shootQueued) { this.shootQueued = false; return true; }
    return false;
  }

  destroy() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
