// Night Courier — audio: every sound is synthesised with WebAudio.
//
// One file, one job: short procedural bleeps and thuds — footsteps that get
// louder as a guard nears, a pickup chime, a pebble clatter, an alarm sting.
// No sound files, no network; the context starts on the first user gesture.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, duration, type, volume, when = 0, slideTo = null) {
    if (!ensure() || muted) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const start = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  function thud(volume) {
    if (!ensure() || muted) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const start = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, start);
      osc.frequency.exponentialRampToValueAtTime(45, start + 0.09);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.12);
    } catch {
      // Ignore audio failures.
    }
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** A guard's footstep; volume falls with distance (0 = far, 1 = close). */
    footstep(distance01) {
      thud(0.05 + distance01 * 0.22);
    },
    pickup() {
      tone(660, 0.12, 'sine', 0.25);
      tone(990, 0.16, 'sine', 0.22, 0.07);
    },
    pebble() {
      tone(1400, 0.05, 'square', 0.12);
      tone(900, 0.07, 'square', 0.1, 0.06);
    },
    alarm() {
      tone(520, 0.22, 'sawtooth', 0.2, 0, 780);
      tone(520, 0.22, 'sawtooth', 0.2, 0.24, 780);
    },
    caught() {
      tone(320, 0.5, 'sawtooth', 0.25, 0, 90);
    },
    clear() {
      tone(523, 0.14, 'sine', 0.22);
      tone(659, 0.14, 'sine', 0.22, 0.1);
      tone(784, 0.22, 'sine', 0.24, 0.2);
    },
    click() {
      tone(800, 0.05, 'sine', 0.15);
    },
  };
}
