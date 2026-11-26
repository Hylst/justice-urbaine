import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { AudioEngine } from './game/audio/AudioEngine';

const onboardingSlides = [
  {
    image: './onboarding/justice-urbaine-01.webp',
    title: 'La ville appelle',
    text: 'Dans les quartiers oubliés, un syndicat a verrouillé les rues. Hylst, juge urbain, reprend la ville bloc par bloc.',
  },
  {
    image: './onboarding/justice-urbaine-02.webp',
    title: 'La grenade change la distance',
    text: 'Les armes sont rares et limitées. La grenade suit une vraie courbe : profondeur, rebond et minuterie décident du chaos.',
  },
  {
    image: './onboarding/justice-urbaine-03.webp',
    title: 'Les ennemis apprennent à te lire',
    text: 'Archers, snipers et lanceurs télégraphient leurs attaques. Lis les lasers, esquive au dash, brise les caisses pour survivre.',
  },
  {
    image: './onboarding/justice-urbaine-04.webp',
    title: 'Huit zones, un verdict',
    text: 'Des ruelles aux toits, du métro à la tour finale : chaque niveau durcit le tempo. Atteins le Patron et rends justice.',
  },
];

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);

  // HUD refs (updated directly by the game loop for performance)
  const healthFill = useRef<HTMLDivElement>(null);
  const healthText = useRef<HTMLSpanElement>(null);
  const livesEl = useRef<HTMLSpanElement>(null);
  const scoreEl = useRef<HTMLSpanElement>(null);
  const comboEl = useRef<HTMLDivElement>(null);
  const levelEl = useRef<HTMLSpanElement>(null);
  const waveEl = useRef<HTMLSpanElement>(null);
  const bossWrap = useRef<HTMLDivElement>(null);
  const bossFill = useRef<HTMLDivElement>(null);
  const bossName = useRef<HTMLSpanElement>(null);
  const weaponsEl = useRef<HTMLDivElement>(null);

  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(0);

  useEffect(() => {
    if (!canvasRef.current || gameRef.current) return;
    const audio = new AudioEngine();
    audioRef.current = audio;
    const game = new Game(
      canvasRef.current,
      {
        healthFill: healthFill.current!,
        healthText: healthText.current!,
        livesEl: livesEl.current!,
        scoreEl: scoreEl.current!,
        comboEl: comboEl.current!,
        levelEl: levelEl.current!,
        waveEl: waveEl.current!,
        bossWrap: bossWrap.current!,
        bossFill: bossFill.current!,
        bossName: bossName.current!,
        weaponsEl: weaponsEl.current!,
      },
      audio
    );
    gameRef.current = game;
    game.start();

    const fit = () => {
      const stage = stageRef.current;
      const cont = containerRef.current;
      if (!stage || !cont) return;
      const rect = cont.getBoundingClientRect();
      const s = Math.min(rect.width / 1024, rect.height / 576);
      stage.style.transform = `scale(${s})`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(containerRef.current!);
    window.addEventListener('resize', fit);

    const onFsChange = () => {
      setIsFs(!!document.fullscreenElement);
      fit();
    };
    document.addEventListener('fullscreenchange', onFsChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
      document.removeEventListener('fullscreenchange', onFsChange);
      game.stop();
      audio.destroy();
      gameRef.current = null;
    };
  }, []);

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  };

  const toggleMusic = () => {
    const on = !musicOn;
    setMusicOn(on);
    audioRef.current?.init();
    gameRef.current?.setMusicEnabled(on);
  };
  const toggleSfx = () => {
    const on = !sfxOn;
    setSfxOn(on);
    audioRef.current?.init();
    gameRef.current?.setSfxEnabled(on);
  };

  // ---- mobile touch controls ----
  const joyRef = useRef<HTMLDivElement>(null);
  const touchId = useRef<number | null>(null);
  const handleJoyStart = (e: React.PointerEvent) => {
    touchId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    moveJoy(e);
  };
  const moveJoy = (e: React.PointerEvent) => {
    if (touchId.current !== e.pointerId || !joyRef.current) return;
    const r = joyRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    gameRef.current?.setTouchMove(dx, dy);
  };
  const endJoy = () => {
    touchId.current = null;
    gameRef.current?.setTouchMove(0, 0);
  };

  const startFromOnboarding = () => {
    setShowOnboarding(false);
    gameRef.current?.beginGame();
  };

  const nextOnboarding = () => {
    if (onboardingStep >= onboardingSlides.length - 1) startFromOnboarding();
    else setOnboardingStep((s) => s + 1);
  };

  const slide = onboardingSlides[onboardingStep];

  return (
    <div className="ju-wrapper">
      <div ref={containerRef} className="ju-container">
        <div ref={stageRef} className="ju-stage">
          <canvas ref={canvasRef} width={1024} height={576} className="ju-canvas" />

          {showOnboarding && (
            <div className="ju-onboarding">
              <div className="ju-onboarding-panel">
                <div className="ju-onboarding-media">
                  <img src={slide.image} alt={slide.title} />
                </div>
                <div className="ju-onboarding-copy">
                  <p className="ju-onboarding-kicker">Dossier {onboardingStep + 1}/{onboardingSlides.length}</p>
                  <h1>{slide.title}</h1>
                  <p>{slide.text}</p>
                  <div className="ju-onboarding-dots">
                    {onboardingSlides.map((_, i) => (
                      <span key={i} className={i === onboardingStep ? 'is-active' : ''} />
                    ))}
                  </div>
                  <div className="ju-onboarding-actions">
                    <button onClick={startFromOnboarding}>Passer</button>
                    <button className="is-primary" onClick={nextOnboarding}>
                      {onboardingStep === onboardingSlides.length - 1 ? 'Jouer' : 'Suivant'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== HUD ===== */}
          <div className="ju-hud">
            <div className="ju-hpwrap">
              <div className="ju-hplabel">JUGE URBAIN <span ref={livesEl} className="ju-lives" /></div>
              <div className="ju-hpframe">
                <div ref={healthFill} className="ju-hpfill" />
                <span ref={healthText} className="ju-hptext">100</span>
              </div>
            </div>

            <div className="ju-center">
              <span ref={levelEl} className="ju-level">1. QUARTIER EST</span>
              <span ref={waveEl} className="ju-wave">Vague 1/3</span>
              <div ref={comboEl} className="ju-combo" style={{ opacity: 0 }}>COMBO x2</div>
            </div>

            <div className="ju-right">
              <div className="ju-score">SCORE <span ref={scoreEl}>0</span></div>
              <div ref={weaponsEl} className="ju-weapons"></div>
              <div className="ju-btns">
                <button className="ju-btn" onClick={toggleMusic} title="Musique">{musicOn ? '♪' : '🔇'}</button>
                <button className="ju-btn" onClick={toggleSfx} title="Effets sonores">{sfxOn ? '🔊' : '🔈'}</button>
                <button className="ju-btn" onClick={() => gameRef.current?.togglePause()} title="Pause">⏸</button>
                <button className="ju-btn" onClick={toggleFullscreen} title="Plein écran">{isFs ? '🗗' : '⛶'}</button>
              </div>
            </div>
          </div>

          {/* Boss bar */}
          <div ref={bossWrap} className="ju-boss" style={{ display: 'none' }}>
            <span ref={bossName} className="ju-bossname">LE PATRON</span>
            <div className="ju-bossframe"><div ref={bossFill} className="ju-bossfill" /></div>
          </div>

        </div>

          {/* Mobile touch controls */}
          {!showOnboarding && (
          <div className="ju-touch">
            <div
              ref={joyRef}
              className="ju-joy"
              onPointerDown={handleJoyStart}
              onPointerMove={moveJoy}
              onPointerUp={endJoy}
              onPointerCancel={endJoy}
            >
              <div className="ju-joyknob" />
            </div>
            <div className="ju-btns-touch">
              <button className="ju-touch-btn ju-touch-heavy"
                onPointerDown={(e) => { e.preventDefault(); gameRef.current?.triggerHeavyAttack(); }}>
                💥
              </button>
              <button className="ju-touch-btn ju-touch-shoot"
                onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setTouchShoot(); }}>
                🔫
              </button>
              <button className="ju-touch-btn ju-touch-dash"
                onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setTouchDash(); }}>
                💨
              </button>
              <button
                className="ju-attack"
                onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setTouchAttack(true); }}
                onPointerUp={() => gameRef.current?.setTouchAttack(false)}
                onPointerLeave={() => gameRef.current?.setTouchAttack(false)}
              >POING</button>
              <button className="ju-touch-btn ju-touch-switch"
                onPointerDown={(e) => { e.preventDefault(); gameRef.current?.setTouchSwitch(); }}>
                🔄
              </button>
            </div>
          </div>
          )}
      </div>

      <p className="ju-credit">Justice Urbaine, par Hylst / Geoffroy, avec l'aide d'une IA</p>
    </div>
  );
}

export default App;
