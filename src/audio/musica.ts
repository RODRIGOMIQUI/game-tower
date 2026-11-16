// Trilha generativa original: jazz suave/bossa (docs/direcao-de-arte.md §7).
// Piano elétrico por FM, baixo, chocalho e uma melodia esparsa, agendados
// com antecedência (lookahead) para o tempo não oscilar.

/** Acordes como notas MIDI (voicings em posição fechada, região média). */
const PROGRESSOES: number[][][] = [
  // ii–V–I–VI em Dó
  [[50, 53, 57, 60, 64], [43, 53, 57, 59, 64], [48, 52, 55, 59, 62], [45, 52, 55, 58, 61]],
  // I–IV–iii–VI em Fá
  [[41, 52, 57, 60, 64], [46, 53, 57, 60, 62], [45, 52, 55, 60, 64], [50, 53, 57, 60, 63]],
  // ii–V–I–I em Si bemol
  [[48, 51, 55, 58, 62], [41, 51, 55, 57, 62], [46, 50, 53, 57, 60], [46, 50, 53, 57, 62]],
  // vi–ii–V–I em Mi bemol
  [[48, 51, 55, 58, 62], [41, 51, 53, 58, 62], [46, 50, 55, 56, 60], [39, 50, 53, 55, 58]],
];

/** Ritmo do piano em 16 semicolcheias (2 compassos de bossa por acorde: só o 1º aqui). */
const COMP = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
const BAIXO = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];

function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class Musica {
  private passo = 0;
  private compasso = 0;
  private proxima = 0;
  private timer: number | null = null;
  private ruido: AudioBuffer;
  private noite = false;
  private semente = 1;

  constructor(
    private readonly ctx: AudioContext,
    private readonly saida: AudioNode,
  ) {
    this.ruido = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = this.ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Noite: mais lento, mais esparso, mais escuro. */
  definirNoite(n: boolean): void {
    this.noite = n;
  }

  iniciar(): void {
    if (this.timer !== null) return;
    this.proxima = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.agendar(), 25) as unknown as number;
  }

  parar(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private get duracaoPasso(): number {
    const bpm = this.noite ? 70 : 84;
    return 60 / bpm / 4;
  }

  private aleatorio(): number {
    this.semente = (this.semente * 1103515245 + 12345) & 0x7fffffff;
    return this.semente / 0x7fffffff;
  }

  private agendar(): void {
    while (this.proxima < this.ctx.currentTime + 0.12) {
      this.tocarPasso(this.proxima);
      this.proxima += this.duracaoPasso;
      this.passo = (this.passo + 1) % 16;
      if (this.passo === 0) this.compasso++;
    }
  }

  private tocarPasso(t: number): void {
    const prog = PROGRESSOES[Math.floor(this.compasso / 8) % PROGRESSOES.length]!;
    const acorde = prog[Math.floor(this.compasso / 2) % prog.length]!;
    const s = this.passo;
    if (COMP[s] && !(this.noite && s === 13)) {
      const vel = s === 0 ? 0.11 : 0.08;
      for (const n of acorde.slice(1)) this.piano(t, hz(n), vel, this.duracaoPasso * 5);
    }
    if (BAIXO[s]) {
      const raiz = acorde[0]!;
      const nota = s === 6 || s === 14 ? raiz + 7 : raiz;
      this.baixo(t, hz(nota - 12), this.duracaoPasso * 5);
    }
    // Chocalho em colcheias, acento no contratempo
    if (s % 2 === 0) this.chocalho(t, s % 4 === 2 ? 0.035 : 0.018);
    // Melodia esparsa (vibrafone) com notas do acorde, uma oitava acima
    if (s % 4 === 0 && this.aleatorio() < (this.noite ? 0.18 : 0.28)) {
      const nota = acorde[1 + Math.floor(this.aleatorio() * 4)]! + 12;
      this.vibrafone(t, hz(nota), this.duracaoPasso * 6);
    }
  }

  private piano(t: number, f: number, vel: number, dur: number): void {
    const c = this.ctx;
    const port = c.createOscillator();
    const mod = c.createOscillator();
    const modG = c.createGain();
    const g = c.createGain();
    const filtro = c.createBiquadFilter();
    port.frequency.value = f;
    mod.frequency.value = f;
    modG.gain.setValueAtTime(f * 1.8, t);
    modG.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.4);
    mod.connect(modG).connect(port.frequency);
    filtro.type = 'lowpass';
    filtro.frequency.value = this.noite ? 1600 : 2600;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    port.connect(filtro).connect(g).connect(this.saida);
    port.start(t);
    mod.start(t);
    port.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  private baixo(t: number, f: number, dur: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    const filtro = c.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.value = f;
    filtro.type = 'lowpass';
    filtro.frequency.value = 500;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(filtro).connect(g).connect(this.saida);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private chocalho(t: number, vel: number): void {
    const c = this.ctx;
    const fonte = c.createBufferSource();
    fonte.buffer = this.ruido;
    const filtro = c.createBiquadFilter();
    filtro.type = 'highpass';
    filtro.frequency.value = 6000;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    fonte.connect(filtro).connect(g).connect(this.saida);
    fonte.start(t, Math.random() * 0.4, 0.06);
  }

  private vibrafone(t: number, f: number, dur: number): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const trem = c.createOscillator();
    const tremG = c.createGain();
    const g = c.createGain();
    o.frequency.value = f;
    trem.frequency.value = 5.5;
    tremG.gain.value = 0.02;
    trem.connect(tremG).connect(g.gain);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.saida);
    o.start(t);
    trem.start(t);
    o.stop(t + dur + 0.05);
    trem.stop(t + dur + 0.05);
  }
}
