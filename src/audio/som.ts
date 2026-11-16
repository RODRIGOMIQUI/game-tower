// Áudio do jogo, todo sintetizado com WebAudio (sem arquivos).
// Música generativa, ambiente que acompanha o prédio e efeitos curtos.
// Ver docs/direcao-de-arte.md §7.
import { Musica } from './musica';

export type Efeito =
  | 'clique' | 'construir' | 'demolir' | 'ding' | 'caixa' | 'estrela'
  | 'alarme' | 'fogos' | 'erro' | 'pane' | 'conquista';

export interface ConfigAudio {
  mestre: number;
  musica: number;
  efeitos: number;
  ambiente: number;
  mudo: boolean;
}

const CHAVE = 'gametower:audio';
const PADRAO: ConfigAudio = { mestre: 0.7, musica: 0.5, efeitos: 0.7, ambiente: 0.5, mudo: false };
/** Intervalo mínimo entre "dings" de elevador (ms), para não virar ruído. */
const INTERVALO_DING = 300;

export class Som {
  private ctx: AudioContext | null = null;
  private mestre!: GainNode;
  private gMusica!: GainNode;
  private gEfeitos!: GainNode;
  private gAmbiente!: GainNode;
  private musica: Musica | null = null;
  private ruido!: AudioBuffer;
  private murmurio!: GainNode;
  private rua!: GainNode;
  private vento!: GainNode;
  private ultimoDing = 0;
  config: ConfigAudio;

  constructor() {
    this.config = { ...PADRAO };
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo) this.config = { ...PADRAO, ...(JSON.parse(salvo) as Partial<ConfigAudio>) };
    } catch {
      // sem armazenamento: usa o padrão
    }
  }

  get ativo(): boolean {
    return this.ctx !== null;
  }

  /** Navegadores só liberam áudio após um gesto do usuário: chame no 1º clique/tecla. */
  iniciar(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    this.ctx = c;
    this.mestre = c.createGain();
    this.mestre.connect(c.destination);
    this.gMusica = c.createGain();
    this.gEfeitos = c.createGain();
    this.gAmbiente = c.createGain();
    for (const g of [this.gMusica, this.gEfeitos, this.gAmbiente]) g.connect(this.mestre);
    this.ruido = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.ruido.getChannelData(0);
    // Ruído "marrom" (mais grave e macio que o branco)
    let ultimo = 0;
    for (let i = 0; i < d.length; i++) {
      ultimo = (ultimo + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = ultimo * 3.5;
    }
    this.murmurio = this.camadaAmbiente('bandpass', 520, 0.8);
    this.rua = this.camadaAmbiente('lowpass', 260, 0.7);
    this.vento = this.camadaAmbiente('bandpass', 900, 2.5, true);
    this.musica = new Musica(c, this.gMusica);
    this.musica.iniciar();
    this.aplicarConfig();
  }

  private camadaAmbiente(tipo: BiquadFilterType, freq: number, q: number, lfo = false): GainNode {
    const c = this.ctx!;
    const fonte = c.createBufferSource();
    fonte.buffer = this.ruido;
    fonte.loop = true;
    const filtro = c.createBiquadFilter();
    filtro.type = tipo;
    filtro.frequency.value = freq;
    filtro.Q.value = q;
    if (lfo) {
      const osc = c.createOscillator();
      const og = c.createGain();
      osc.frequency.value = 0.08;
      og.gain.value = 400;
      osc.connect(og).connect(filtro.frequency);
      osc.start();
    }
    const g = c.createGain();
    g.gain.value = 0;
    fonte.connect(filtro).connect(g).connect(this.gAmbiente);
    fonte.start(0, Math.random() * 2);
    return g;
  }

  mudar(parcial: Partial<ConfigAudio>): void {
    this.config = { ...this.config, ...parcial };
    try {
      localStorage.setItem(CHAVE, JSON.stringify(this.config));
    } catch {
      // ignora
    }
    this.aplicarConfig();
  }

  private aplicarConfig(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = this.config;
    this.mestre.gain.setTargetAtTime(k.mudo ? 0 : k.mestre, t, 0.05);
    this.gMusica.gain.setTargetAtTime(k.musica * 0.6, t, 0.05);
    this.gEfeitos.gain.setTargetAtTime(k.efeitos, t, 0.05);
    this.gAmbiente.gain.setTargetAtTime(k.ambiente, t, 0.05);
  }

  /**
   * Ambiente adaptativo (chamado algumas vezes por segundo):
   * murmúrio cresce com as pessoas visíveis; trânsito perto do chão; vento no alto.
   */
  ambiente(pessoasVisiveis: number, andarCamera: number, noite: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.murmurio.gain.setTargetAtTime(Math.min(1, pessoasVisiveis / 250) * 0.25, t, 0.5);
    this.rua.gain.setTargetAtTime(Math.max(0, 1 - Math.max(0, andarCamera) / 12) * (noite ? 0.06 : 0.14), t, 0.8);
    this.vento.gain.setTargetAtTime(Math.min(1, Math.max(0, (andarCamera - 25) / 40)) * 0.18, t, 0.8);
    this.musica?.definirNoite(noite);
  }

  efeito(e: Efeito): void {
    const c = this.ctx;
    if (!c || this.config.mudo) return;
    const t = c.currentTime + 0.01;
    switch (e) {
      case 'clique':
        this.tom(t, 1800, 0.03, 0.05, 'square');
        break;
      case 'construir':
        this.varredura(t, 180, 70, 0.12, 0.25);
        this.estalo(t, 0.05, 2500, 0.08);
        break;
      case 'demolir':
        this.estalo(t, 0.35, 600, 0.3);
        this.varredura(t, 120, 40, 0.3, 0.2);
        break;
      case 'ding': {
        const agora = performance.now();
        if (agora - this.ultimoDing < INTERVALO_DING) return;
        this.ultimoDing = agora;
        this.tom(t, 1318.5, 0.6, 0.05);
        this.tom(t + 0.14, 1046.5, 0.8, 0.05);
        break;
      }
      case 'caixa':
        this.estalo(t, 0.08, 4000, 0.15);
        this.tom(t + 0.06, 2093, 0.7, 0.08);
        this.tom(t + 0.06, 2637, 0.7, 0.06);
        break;
      case 'estrela':
      case 'conquista':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tom(t + i * 0.11, f, 0.5, 0.1, 'triangle'));
        if (e === 'estrela') this.tom(t + 0.44, 1318.5, 0.9, 0.08, 'triangle');
        break;
      case 'alarme':
        for (let i = 0; i < 4; i++) this.varredura(t + i * 0.5, 620, 900, 0.45, 0.06, 'square');
        break;
      case 'fogos':
        this.varredura(t, 300, 1400, 0.4, 0.04);
        this.estalo(t + 0.4, 0.5, 1500, 0.25);
        break;
      case 'erro':
        this.tom(t, 196, 0.15, 0.08, 'square');
        break;
      case 'pane':
        this.varredura(t, 500, 140, 0.5, 0.12, 'sawtooth');
        break;
    }
  }

  private tom(t: number, f: number, dur: number, vol: number, tipo: OscillatorType = 'sine'): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = tipo;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.gEfeitos);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private varredura(t: number, f0: number, f1: number, dur: number, vol: number, tipo: OscillatorType = 'sine'): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.gEfeitos);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private estalo(t: number, dur: number, freq: number, vol: number): void {
    const c = this.ctx!;
    const f = c.createBufferSource();
    f.buffer = this.ruido;
    const filtro = c.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    f.connect(filtro).connect(g).connect(this.gEfeitos);
    f.start(t, Math.random(), dur + 0.05);
  }
}
