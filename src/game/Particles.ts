interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  shape: 'spark' | 'dot' | 'ring' | 'shard';
  rot: number;
  vrot: number;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

export class Particles {
  private parts: Particle[] = [];
  private texts: FloatText[] = [];

  clear() {
    this.parts = [];
    this.texts = [];
  }

  burst(x: number, y: number, color: string, count = 12, opts?: { speed?: number; gravity?: number; size?: number }) {
    const speed = opts?.speed ?? 3.5;
    const gravity = opts?.gravity ?? 0.12;
    const size = opts?.size ?? 1;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.9);
      this.parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.4,
        size: (1.5 + Math.random() * 3) * size,
        color,
        gravity,
        shape: Math.random() < 0.5 ? 'spark' : 'shard',
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  ring(x: number, y: number, color: string, size = 1) {
    this.parts.push({
      x, y, vx: 0, vy: 0, life: 0, maxLife: 0.3, size: 8 * size, color, gravity: 0,
      shape: 'ring', rot: 0, vrot: 0,
    });
  }

  dust(x: number, y: number, color = 'rgba(180,180,200,0.5)') {
    for (let i = 0; i < 3; i++) {
      this.parts.push({
        x: x + (Math.random() - 0.5) * 12, y: y - Math.random() * 4,
        vx: (Math.random() - 0.5) * 1.2, vy: -Math.random() * 1.2,
        life: 0, maxLife: 0.4 + Math.random() * 0.3,
        size: 2 + Math.random() * 3, color, gravity: 0.05,
        shape: 'dot', rot: 0, vrot: 0,
      });
    }
  }

  text(x: number, y: number, text: string, color = '#ffd23b', size = 18) {
    this.texts.push({ x, y, vy: -0.7, life: 0, maxLife: 0.9, text, color, size });
  }

  update(dt: number) {
    const dts = dt / 1000;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dts;
      if (p.life >= p.maxLife) { this.parts.splice(i, 1); continue; }
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dts;
      if (t.life >= t.maxLife) { this.texts.splice(i, 1); continue; }
      t.y += t.vy;
      t.vy *= 0.96;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const k = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      if (p.shape === 'ring') {
        ctx.lineWidth = 2 * k + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - k) * 3), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === 'spark') {
        ctx.lineWidth = p.size * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 2, p.y - p.vy * 2);
        ctx.stroke();
      } else if (p.shape === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = 1 - t.life / t.maxLife;
      ctx.globalAlpha = Math.max(0, k);
      ctx.font = `bold ${t.size}px "Courier New", monospace`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}
