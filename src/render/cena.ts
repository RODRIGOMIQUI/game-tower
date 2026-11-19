// Desenho do mundo com PixiJS (docs/direcao-de-arte.md). Unidades são sprites
// de pixel art gerados por arte.ts; estrutura, poços e escadas são desenhados
// aqui. Só redesenha estrutura/unidades quando o mundo muda.
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { FabricaArte, type Variante } from './arte';
import { Fundo } from './fundo';
import type { Plano } from '../sim/construcao';
import { ehElevador, ehEscada, tipo } from '../sim/dados';
import { ANDAR_MAX, ANDAR_MIN, Est, LARGURA, nomeAndar, type Mundo, type Unidade } from '../sim/mundo';
import { ANDAR_PX, Camera, COL_PX, LAJE_PX, topoDoAndar, type Celula } from './camera';
import { CamadaDinamica } from './dinamica';
import { COR, COR_CATEGORIA, corDoCeu, escurecer, escuridao, misturar } from './paleta';
import type { Dinamico } from '../worker/protocolo';

const INTERIOR_PX = ANDAR_PX - LAJE_PX;
const LARGURA_PX = LARGURA * COL_PX;
const FUNDO_PX = -topoDoAndar(ANDAR_MIN - 1); // base do B10
const TOPO_PX = topoDoAndar(ANDAR_MAX);
const FAIXAS_CEU = 48;

const COR_INTERIOR: Record<number, number> = {
  [Est.Piso]: COR.interiorVazio,
  [Est.Lobby]: COR.lobby,
  [Est.Escavado]: COR.escavado,
  [Est.LobbyCorp]: COR.lobbyCorp,
  [Est.Atrio]: COR.atrio,
  [Est.Grand]: COR.grand,
};

export class Cena {
  readonly camera = new Camera();
  private readonly ceu = new Graphics();
  private readonly mundoBase = new Container();
  private readonly mundoTopo = new Container();
  private readonly terreno = new Graphics();
  private readonly estrutura = new Graphics();
  private readonly unidades = new Graphics();
  private readonly sprites = new Container();
  private readonly marcadores = new Graphics();
  private readonly brilho = new Graphics();
  private readonly arte: FabricaArte;
  private readonly fundo: Fundo;
  private minutoAtual = 360;
  private escuro = 0;
  private readonly rotulos = new Container();
  private readonly noite = new Graphics();
  private readonly grade = new Graphics();
  private readonly fantasma = new Graphics();
  private readonly dinamicaC = new Container();
  private readonly alertas = new Graphics();
  private readonly fogos = new Graphics();
  private readonly camadaG = new Graphics();
  private readonly foraDoLote = new Graphics();
  private loteAtual = '';
  private readonly dinamica: CamadaDinamica;
  private chaveAlertas = '';
  private mundoAtual: Mundo | null = null;
  private readonly situacoes = new Map<number, Situacao>();
  private versaoSituacoes = -1;
  private escalaGrade = -1;
  private chaveCeu = '';

  constructor(private readonly app: Application) {
    this.arte = new FabricaArte(app.renderer);
    this.mundoBase.addChild(
      this.terreno, this.foraDoLote, this.estrutura, this.sprites, this.unidades, this.marcadores,
      this.camadaG, this.dinamicaC, this.alertas, this.rotulos,
    );
    this.dinamica = new CamadaDinamica(this.dinamicaC, app.renderer);
    this.sprites.cullableChildren = true;
    // O brilho fica acima da camada de noite: janelas acesas não escurecem.
    this.mundoTopo.addChild(this.brilho, this.grade, this.fantasma);
    this.fundo = new Fundo(app.renderer);
    app.stage.addChild(this.ceu, this.fundo.raiz, this.fogos, this.mundoBase, this.noite, this.mundoTopo);
    this.desenharTerreno();
    this.grade.visible = false;
    this.enquadrarInicio();
    app.renderer.on('resize', () => this.aplicarCamera());
  }

  /** Olha o meio do lote, com o chão a ~2/3 da altura da tela. */
  enquadrarInicio(): void {
    this.camera.centralizar(LARGURA_PX / 2, 0, this.larguraTela, this.alturaTela);
    this.camera.oy = Math.round(this.alturaTela * 0.68);
    this.aplicarCamera();
  }

  get larguraTela(): number {
    return this.app.screen.width;
  }

  get alturaTela(): number {
    return this.app.screen.height;
  }

  celulaEm(sx: number, sy: number): Celula {
    return this.camera.celulaEm(sx, sy);
  }

  aplicarCamera(): void {
    this.camera.limitar(this.larguraTela, this.alturaTela);
    const { ox, oy, escala } = this.camera;
    for (const c of [this.mundoBase, this.mundoTopo]) {
      c.position.set(ox, oy);
      c.scale.set(escala);
    }
    if (this.escalaGrade !== escala) this.desenharGrade();
  }

  mostrarGrade(v: boolean): void {
    this.grade.visible = v;
  }

  // ---------------------------------------------------------------- terreno

  private desenharTerreno(): void {
    const g = this.terreno;
    const extra = 6000;
    g.rect(-extra, 0, LARGURA_PX + extra * 2, FUNDO_PX + 2000).fill(COR.terra);
    g.rect(0, 0, LARGURA_PX, FUNDO_PX).fill(COR.terraLote);
    g.rect(-extra, -2, LARGURA_PX + extra * 2, 3).fill(COR.grama);
    // Limites do lote
    for (const x of [0, LARGURA_PX]) {
      for (let y = TOPO_PX; y < FUNDO_PX; y += 24) g.rect(x - 0.5, y, 1, 12).fill({ color: 0xffffff, alpha: 0.25 });
    }
    // Números de andar a cada 5 andares, de cada lado do lote
    for (let y = ANDAR_MIN; y <= ANDAR_MAX; y++) {
      const andar = y + 1;
      if (y >= 0 && andar !== 1 && andar % 5 !== 0) continue;
      for (const [x, ancora] of [[-6, 1], [LARGURA_PX + 6, 0]] as const) {
        const t = new Text({
          text: nomeAndar(y),
          style: { fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 11, fill: 0xffffff },
          resolution: 4,
        });
        t.alpha = 0.55;
        t.anchor.set(ancora, 0.5);
        t.position.set(x, topoDoAndar(y) + ANDAR_PX / 2);
        this.rotulos.addChild(t);
      }
    }
  }

  private desenharGrade(): void {
    const s = this.camera.escala;
    this.escalaGrade = s;
    const g = this.grade.clear();
    const w = 1 / s;
    const cor = { color: 0xffffff, alpha: s >= 1 ? 0.07 : 0.04 };
    const passoX = s >= 1 ? 1 : 4;
    for (let x = 0; x <= LARGURA; x += passoX) g.rect(x * COL_PX, TOPO_PX, w, FUNDO_PX - TOPO_PX).fill(cor);
    for (let y = ANDAR_MIN; y <= ANDAR_MAX + 1; y++) g.rect(0, topoDoAndar(y - 1), LARGURA_PX, w).fill(cor);
  }

  // ------------------------------------------------------------------- céu

  atualizarCeu(minutoDoDia: number): void {
    const m = Math.floor(minutoDoDia);
    this.minutoAtual = minutoDoDia;
    const chave = `${m}:${this.larguraTela}x${this.alturaTela}`;
    if (chave === this.chaveCeu) return;
    this.chaveCeu = chave;
    const { topo, horizonte } = corDoCeu(m);
    const g = this.ceu.clear();
    const w = this.larguraTela;
    const h = this.alturaTela;
    const faixa = Math.ceil(h / FAIXAS_CEU);
    for (let i = 0; i < FAIXAS_CEU; i++) {
      const t = i / (FAIXAS_CEU - 1);
      g.rect(0, i * faixa, w, faixa + 1).fill(misturar(topo, horizonte, t));
    }
    const e = escuridao(m);
    if (Math.abs(e - this.escuro) > 0.04 || (e === 0) !== (this.escuro === 0)) {
      this.escuro = e;
      this.redesenharBrilho();
    }
    this.noite.clear();
    if (e > 0) this.noite.rect(0, 0, w, h).fill({ color: 0x0a0c20, alpha: e * 0.35 });
  }

  // ------------------------------------------------------------------ mundo

  desenharMundo(m: Mundo): void {
    const g = this.estrutura.clear();
    for (let y = ANDAR_MIN; y <= ANDAR_MAX; y++) {
      const topo = topoDoAndar(y);
      let x = 0;
      while (x < LARGURA) {
        const c = m.est(x, y);
        if (c === Est.Vazio) {
          x++;
          continue;
        }
        let fim = x + 1;
        while (fim < LARGURA && m.est(fim, y) === c) fim++;
        desenharTrecho(g, m, c, x, fim, y);
        x = fim;
      }
    }

    this.mundoAtual = m;
    // Mundo novo (construção ou save carregado): alertas e situações chegam de
    // novo no próximo quadro. As chaves deles podem repetir as de outro jogo.
    this.chaveAlertas = '';
    this.versaoSituacoes = -1;
    this.redesenharUnidades();
  }

  /** Recebe [uid, situação, satisfação, avisos, ruído, estresse] por unidade e redesenha se mudou. */
  atualizarSituacoes(resumo: Float32Array, versao: number): void {
    if (versao === this.versaoSituacoes) return;
    this.versaoSituacoes = versao;
    this.situacoes.clear();
    for (let i = 0; i < resumo.length; i += 6) {
      this.situacoes.set(resumo[i]!, {
        situacao: resumo[i + 1]!,
        satisfacao: resumo[i + 2]!,
        avisos: resumo[i + 3]!,
        ruido: resumo[i + 4]!,
        estresse: resumo[i + 5]!,
      });
    }
    this.redesenharUnidades(false);
  }

  /** Cenários com terreno menor: escurece o que fica fora do lote. */
  definirLote(lote: [number, number] | undefined): void {
    const chave = lote ? lote.join(':') : '';
    if (chave === this.loteAtual) return;
    this.loteAtual = chave;
    const g = this.foraDoLote.clear();
    if (!lote) return;
    const [a, b] = lote;
    const cor = { color: 0x0a0c20, alpha: 0.45 };
    g.rect(0, TOPO_PX, a * COL_PX, FUNDO_PX - TOPO_PX).fill(cor);
    g.rect((b + 1) * COL_PX, TOPO_PX, (LARGURA - b - 1) * COL_PX, FUNDO_PX - TOPO_PX).fill(cor);
    for (const x of [a * COL_PX, (b + 1) * COL_PX]) g.rect(x - 1, TOPO_PX, 2, FUNDO_PX - TOPO_PX).fill({ color: COR.atencao, alpha: 0.6 });
  }

  // ------------------------------------------------------------- camadas

  /** Camada de diagnóstico ativa (tecla O). Ver docs/gdd.md §11. */
  camada: Camada = 'nenhuma';
  private esperas = new Map<number, number>();

  atualizarEsperas(pocos: { uid: number; esperaMedia: number }[]): void {
    this.esperas = new Map(pocos.map((p) => [p.uid, p.esperaMedia]));
  }

  /** Redesenha a camada (chamado a cada quadro; é barato). */
  desenharCamada(): void {
    const g = this.camadaG.clear();
    const m = this.mundoAtual;
    if (this.camada === 'nenhuma' || !m) return;
    if (this.camada === 'trafego') {
      // Densidade de pessoas visíveis em blocos de 6 colunas por andar.
      const contagem = new Map<string, number>();
      for (const [x, y] of this.dinamica.posicoes()) {
        const k = `${Math.floor(x / 6)}:${Math.round(y)}`;
        contagem.set(k, (contagem.get(k) ?? 0) + 1);
      }
      for (const [k, n] of contagem) {
        const [bx, y] = k.split(':').map(Number) as [number, number];
        intensidade(g, bx * 6 * COL_PX, topoDoAndar(y), 6 * COL_PX, INTERIOR_PX, Math.min(1, n / 8));
      }
      return;
    }
    for (const u of m.unidades.values()) {
      const r = retanguloUnidade(u);
      if (this.camada === 'espera') {
        const e = this.esperas.get(u.uid);
        if (e !== undefined) intensidade(g, r.x, topoDoAndar(u.y + u.altura - 1), r.w, u.altura * ANDAR_PX, Math.min(1, e / 60));
        continue;
      }
      const s = this.situacoes.get(u.uid);
      if (!s) continue;
      if (this.camada === 'ocupacao') {
        const cor = s.situacao === 0 ? COR.vago : s.situacao === 3 || s.situacao === 4 ? COR.sujo : COR.valido;
        g.rect(r.x, r.y, r.w, r.h).fill({ color: cor, alpha: 0.6 });
        continue;
      }
      if (s.situacao === 0) continue; // vaga: sem dado
      const t =
        this.camada === 'estresse' ? s.estresse / 100 : this.camada === 'ruido' ? s.ruido / 40 : 1 - s.satisfacao / 100;
      intensidade(g, r.x, r.y, r.w, r.h, Math.max(0, Math.min(1, t)));
    }
  }

  /**
   * Sprite de cada unidade (por uid), a variante que ele mostra e a unidade
   * desenhada (tipo e retângulo). Um save carregado pode reaproveitar o uid
   * para outra unidade: aí a chave muda e o sprite é refeito.
   */
  private readonly spritesPorUid = new Map<number, { sprite: Sprite; variante: Variante; uid: number; chave: string }>();

  /**
   * Prédio mudou: sincroniza sprites (cria/remove só o necessário) e redesenha
   * poços e escadas. Situação mudou: só troca a textura de quem mudou.
   */
  private redesenharUnidades(mundoMudou = true): void {
    const m = this.mundoAtual;
    if (!m) return;
    if (mundoMudou) {
      const gu = this.unidades.clear();
      for (const [uid, reg] of this.spritesPorUid) {
        const u = m.unidades.get(uid);
        if (u && chaveUnidade(u) === reg.chave) continue;
        reg.sprite.destroy();
        this.spritesPorUid.delete(uid);
      }
      for (const u of m.unidades.values()) {
        if (ehElevador(u.tipo)) desenharPoco(gu, u);
        else if (ehEscada(u.tipo)) desenharEscada(gu, u);
      }
    }
    const gm = this.marcadores.clear();
    for (const u of m.unidades.values()) {
      if (ehElevador(u.tipo) || ehEscada(u.tipo)) continue;
      const s = this.situacoes.get(u.uid);
      const variante: Variante =
        s?.situacao === 0 ? 'vaga' : s?.situacao === 3 ? 'suja' : s?.situacao === 4 ? 'pragas' : 'normal';
      let reg = this.spritesPorUid.get(u.uid);
      if (!reg) {
        const r = retanguloUnidade(u);
        const sprite = new Sprite(this.arte.unidade(u.tipo, u.largura, u.altura, variante, u.uid));
        sprite.position.set(r.x, r.y);
        sprite.cullable = true;
        this.sprites.addChild(sprite);
        reg = { sprite, variante, uid: u.uid, chave: chaveUnidade(u) };
        this.spritesPorUid.set(u.uid, reg);
      } else if (reg.variante !== variante) {
        reg.sprite.texture = this.arte.unidade(u.tipo, u.largura, u.altura, variante, u.uid);
        reg.variante = variante;
      }
      if (s && (s.avisos > 0 || s.satisfacao < 40) && s.situacao !== 0) desenharMarcador(gm, u, s);
    }
    this.redesenharBrilho();
  }

  /** Janelas acesas à noite nas unidades ocupadas (acima da camada de noite). */
  private redesenharBrilho(): void {
    const g = this.brilho.clear();
    const m = this.mundoAtual;
    if (!m || this.escuro < 0.05) return;
    const a = this.escuro;
    for (const u of m.unidades.values()) {
      const s = this.situacoes.get(u.uid);
      if (!s || s.situacao === 0 || s.situacao === 3 || s.situacao === 4) continue;
      const r = retanguloUnidade(u);
      g.rect(r.x + 1, r.y + 2, r.w - 2, r.h - 4).fill({ color: COR.janelaNoite, alpha: 0.22 * a });
      g.rect(r.x + 1, r.y + 2, r.w - 2, 3).fill({ color: COR.janelaNoite, alpha: 0.35 * a }); // luz do teto
    }
  }

  /** Contorno vermelho nas unidades sem rota a partir da rua. */
  desenharAlertas(m: Mundo, semAcesso: number[]): void {
    const chave = `${semAcesso.join(',')}|${m.unidades.size}`;
    if (chave === this.chaveAlertas) return;
    this.chaveAlertas = chave;
    const g = this.alertas.clear();
    for (const uid of semAcesso) {
      const u = m.unidades.get(uid);
      if (!u) continue;
      const r = retanguloUnidade(u);
      g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).stroke({ width: 2, color: COR.alerta });
      // Ícone "!" no canto
      g.rect(r.x + r.w - 9, r.y + 3, 6, 10).fill(COR.alerta);
      g.rect(r.x + r.w - 7, r.y + 5, 2, 4).fill(0xffffff);
      g.rect(r.x + r.w - 7, r.y + 10, 2, 2).fill(0xffffff);
    }
  }

  /** Recebe um quadro dinâmico; devolve quantos carros pararam dentro da tela (para o "ding"). */
  receberDinamica(d: Dinamico, agora: number): number {
    const paradas = this.dinamica.receber(d, agora);
    let visiveis = 0;
    for (const p of paradas) {
      const u = this.mundoAtual?.unidades.get(p.x);
      if (!u) continue;
      const sx = this.camera.ox + (u.x + 2) * COL_PX * this.camera.escala;
      const sy = this.camera.oy + topoDoAndar(p.y) * this.camera.escala;
      if (sx >= 0 && sx <= this.larguraTela && sy >= 0 && sy <= this.alturaTela) visiveis++;
    }
    return visiveis;
  }

  get pessoasVisiveis(): number {
    return this.dinamica.visiveis;
  }

  /** Andar no centro da tela (para o som ambiente). */
  get andarNoCentro(): number {
    return this.camera.celulaEm(this.larguraTela / 2, this.alturaTela / 2).y;
  }

  get escuridaoAtual(): number {
    return this.escuro;
  }

  desenharDinamica(agora: number, m: Mundo): void {
    // Céu e noite acompanham redimensionamentos mesmo com o jogo pausado (sai cedo se nada mudou).
    this.atualizarCeu(this.minutoAtual);
    this.dinamica.desenhar(agora, m, this.camera.escala, this.areaVisivel());
    this.fundo.atualizar(
      this.minutoAtual, agora, this.larguraTela, this.alturaTela, this.camera.oy, this.camera.ox, this.camera.escala,
    );
  }

  /** Retângulo do mundo (px de mundo) que está na tela, com uma margem. */
  areaVisivel(): { x0: number; y0: number; x1: number; y1: number } {
    const { ox, oy, escala } = this.camera;
    const m = 40;
    return {
      x0: (-ox - m) / escala,
      y0: (-oy - m) / escala,
      x1: (this.larguraTela - ox + m) / escala,
      y1: (this.alturaTela - oy + m) / escala,
    };
  }

  /** Posição interpolada de uma pessoa visível, em (coluna, andar). */
  posicaoPessoa(id: number, agora: number): { x: number; y: number } | null {
    return this.dinamica.posicao(id, agora);
  }

  /** Pessoa visível sob o ponto da tela (sx, sy), ou 0. */
  pessoaEm(sx: number, sy: number): number {
    const { wx, wy } = this.camera.telaParaMundo(sx, sy);
    const raio = Math.max(1, 6 / this.camera.escala / COL_PX);
    // y do ponto em andares fracionários (pés da pessoa ficam na base do andar)
    return this.dinamica.pessoaEm(wx / COL_PX, Math.ceil(-wy / ANDAR_PX) - 1, raio);
  }

  /** Centraliza a câmera em (coluna, andar). */
  centralizarEm(x: number, y: number): void {
    this.camera.centralizar(x * COL_PX, topoDoAndar(y) + ANDAR_PX / 2, this.larguraTela, this.alturaTela);
    this.aplicarCamera();
  }

  /** Fogos de artifício no céu (festival de ano novo). */
  desenharFogos(agora: number, ativo: boolean): void {
    const g = this.fogos.clear();
    if (!ativo) return;
    const w = this.larguraTela;
    const h = this.alturaTela;
    const cores = [0xff5a3c, 0xffd27a, 0x6bc9b4, 0xb98ac9, 0x7fa7c9, 0xffffff];
    for (let k = 0; k < 5; k++) {
      const ciclo = 1400;
      const t = agora + k * 280;
      const n = Math.floor(t / ciclo);
      const fase = (t % ciclo) / ciclo;
      const semente = (n * 7919 + k * 104729) % 1000;
      const cx = ((semente * 37) % 1000) / 1000 * w;
      const cy = (0.08 + ((semente * 53) % 1000) / 1000 * 0.35) * h;
      const cor = cores[(n + k) % cores.length]!;
      const raio = 20 + fase * 60;
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2;
        g.circle(cx + Math.cos(ang) * raio, cy + Math.sin(ang) * raio + fase * fase * 20, 2).fill({ color: cor, alpha: 1 - fase });
      }
    }
  }

  // --------------------------------------------------------------- fantasma

  desenharFantasma(plano: Plano | null, hover: Celula | null, destaque: Unidade | null): void {
    const g = this.fantasma.clear();
    const borda = 1 / this.camera.escala;
    if (destaque) {
      const r = retanguloUnidade(destaque);
      g.rect(r.x, r.y, r.w, r.h).stroke({ width: borda * 2, color: 0xffffff, alpha: 0.9 });
    }
    if (plano) {
      const demolir = plano.acao === 'demolir';
      for (const it of plano.itens) {
        const r = it.estrutura
          ? { x: it.x * COL_PX, y: topoDoAndar(it.y), w: COL_PX, h: ANDAR_PX }
          : retanguloUnidade(it);
        const cor = !it.ok ? 0x777777 : demolir ? COR.alerta : COR.valido;
        g.rect(r.x, r.y, r.w, r.h).fill({ color: it.ok ? cor : COR.alerta, alpha: it.ok ? 0.4 : 0.25 });
        g.rect(r.x, r.y, r.w, r.h).stroke({ width: borda, color: cor, alpha: 0.9 });
      }
    }
    if (hover && !plano) {
      g.rect(hover.x * COL_PX, topoDoAndar(hover.y), COL_PX, ANDAR_PX).stroke({
        width: borda,
        color: 0xffffff,
        alpha: 0.6,
      });
    }
  }
}

function retanguloUnidade(u: { x: number; y: number; largura: number; altura: number }) {
  return {
    x: u.x * COL_PX,
    y: topoDoAndar(u.y + u.altura - 1),
    w: u.largura * COL_PX,
    h: u.altura * ANDAR_PX - LAJE_PX,
  };
}

interface Situacao {
  /** 0 vaga, 1 ocupada, 2 hospedada, 3 suja, 4 infestada (ver CODIGO_SITUACAO). */
  situacao: number;
  satisfacao: number;
  avisos: number;
  ruido: number;
  estresse: number;
}

export type Camada = 'nenhuma' | 'estresse' | 'satisfacao' | 'ruido' | 'ocupacao' | 'espera' | 'trafego';

/**
 * Escala sequencial de um só tom (problema): quase transparente = pouco,
 * vermelho-alaranjado intenso = muito.
 */
function intensidade(g: Graphics, x: number, y: number, w: number, h: number, t: number): void {
  g.rect(x, y, w, h).fill({ color: misturar(0xffd27a, 0xe0393e, t), alpha: 0.15 + 0.65 * t });
}

/** Marcador de insatisfação sobre a unidade: amarelo (< 40), laranja (já recebeu aviso). */
function desenharMarcador(g: Graphics, u: Unidade, s: Situacao | undefined): void {
  const r = retanguloUnidade(u);
  const vaga = s?.situacao === 0;
  if (s && !vaga && (s.avisos > 0 || s.satisfacao < 40)) {
    // Marcador de insatisfação: amarelo (< 40), laranja (já recebeu aviso)
    const corM = s.avisos > 0 ? COR.alerta : COR.atencao;
    g.circle(r.x + r.w - 6, r.y + 10, 4).fill(corM);
    g.rect(r.x + r.w - 6.5, r.y + 7, 1, 4).fill(0x1e2129);
    g.rect(r.x + r.w - 6.5, r.y + 12, 1, 1).fill(0x1e2129);
  }
}

/** Poço: coluna escura atravessando os andares, com portas em cada andar. */
function desenharPoco(g: Graphics, u: Unidade): void {
  const x = u.x * COL_PX;
  const w = u.largura * COL_PX;
  const topo = topoDoAndar(u.y + u.altura - 1);
  const base = topoDoAndar(u.y) + INTERIOR_PX;
  g.rect(x, topo, w, base - topo).fill(COR.poco);
  g.rect(x, topo, 1, base - topo).fill(COR.estruturaClaro);
  g.rect(x + w - 1, topo, 1, base - topo).fill(COR.estruturaClaro);
  const expresso = u.tipo === 'elevador_expresso';
  const servico = u.tipo === 'elevador_servico';
  // Cabos
  g.rect(x + w / 2 - 2, topo, 1, base - topo).fill({ color: 0x6a7080, alpha: 0.6 });
  g.rect(x + w / 2 + 1, topo, 1, base - topo).fill({ color: 0x6a7080, alpha: 0.6 });
  for (let y = u.y; y < u.y + u.altura; y++) {
    const t = topoDoAndar(y);
    g.rect(x + 1, t + INTERIOR_PX, w - 2, LAJE_PX).fill(COR.estrutura);
    if (!expresso || y <= 0) {
      // Batente da porta e luz de chamada
      g.rect(x - 1, t + 8, 2, INTERIOR_PX - 8).fill(COR.portaPoco);
      g.rect(x - 3, t + 14, 2, 2).fill(servico ? 0xe8c547 : 0x7fd0ff);
    }
  }
  if (expresso) g.rect(x, topo - 6, w, 2).fill(0xd8b04a); // faixa dourada do expresso
  // Casa de máquinas no topo
  g.rect(x, topo - 6, w, 6).fill(COR.estrutura);
}

/** Escada: degraus subindo da esquerda para a direita até o andar de cima. */
function desenharEscada(g: Graphics, u: Unidade): void {
  const x = u.x * COL_PX;
  const w = u.largura * COL_PX;
  const base = topoDoAndar(u.y) + INTERIOR_PX;
  const altura = ANDAR_PX;
  const cor = u.tipo === 'escada_rolante' ? COR_CATEGORIA.transito : COR.degrau;
  const degraus = 8;
  for (let i = 0; i < degraus; i++) {
    const dx = (w / degraus) * i;
    const dy = (altura / degraus) * (i + 1);
    g.rect(x + dx, base - dy, w / degraus + 0.5, 2).fill(cor);
    g.rect(x + dx, base - dy, 1, dy).fill(escurecer(cor, 0.7));
  }
}

/**
 * Trecho contínuo de estrutura num andar: andar vazio (parede com janelas),
 * lobby (mármore, colunas e portas de vidro nas pontas) ou subsolo (concreto).
 */
function desenharTrecho(g: Graphics, m: Mundo, c: number, x0: number, x1: number, y: number): void {
  const topo = topoDoAndar(y);
  const px = x0 * COL_PX;
  const w = (x1 - x0) * COL_PX;
  const r = (x: number, yy: number, ww: number, hh: number, cor: number, alpha = 1) =>
    g.rect(x, yy, ww, hh).fill({ color: cor, alpha });
  // Portas só onde o térreo acaba (entradas de verdade), não entre variantes.
  const pontas: Pontas = [y === 0 && m.est(x0 - 1, 0) === Est.Vazio, y === 0 && m.est(x1, 0) === Est.Vazio];
  if (c === Est.Lobby) {
    r(px, topo, w, INTERIOR_PX, COR.lobby);
    r(px, topo, w, 3, escurecer(COR.lobby, 0.85));
    for (let i = 0; i < x1 - x0; i++) r(px + i * COL_PX, topo + INTERIOR_PX - 3, COL_PX, 3, i % 2 ? 0xe8dcc0 : 0xd4c4a0);
    for (let xc = x0 + 6; xc < x1 - 2; xc += 12) {
      r(xc * COL_PX, topo + 3, 4, INTERIOR_PX - 6, 0xf0e6d0);
      r(xc * COL_PX + 3, topo + 3, 1, INTERIOR_PX - 6, escurecer(COR.lobby, 0.8));
    }
    if (y === 0) {
      // Portas de vidro nas pontas (entradas)
      for (const xp of [pontas[0] ? px + 1 : NaN, pontas[1] ? px + w - 11 : NaN]) {
        if (Number.isNaN(xp)) continue;
        r(xp, topo + 8, 10, INTERIOR_PX - 8, COR.estruturaClaro);
        r(xp + 1, topo + 9, 8, INTERIOR_PX - 9, 0xa9d8f0, 0.85);
        r(xp + 5, topo + 9, 1, INTERIOR_PX - 9, COR.estruturaClaro);
      }
    }
  } else if (c === Est.LobbyCorp) {
    desenharCorporativo(r, x0, x1, topo, px, w, pontas);
  } else if (c === Est.Atrio) {
    desenharAtrio(r, x0, x1, y, topo, px, w, pontas);
  } else if (c === Est.Grand) {
    desenharGrand(r, x0, x1, y, topo, px, w, pontas);
  } else if (c === Est.Escavado) {
    r(px, topo, w, INTERIOR_PX, COR.escavado);
    r(px, topo + 4, w, 2, escurecer(COR.escavado, 0.75)); // cano
    for (let xc = x0; xc < x1; xc += 10) r(xc * COL_PX, topo, 2, INTERIOR_PX, escurecer(COR.escavado, 0.85));
  } else {
    r(px, topo, w, INTERIOR_PX, COR.interiorVazio);
    r(px, topo, w, 2, escurecer(COR.interiorVazio, 0.85));
    // Janelas da fachada nos andares ainda vazios
    for (let xc = x0 + 1; xc + 2 < x1; xc += 4) {
      r(xc * COL_PX + 2, topo + 7, 20, 14, COR.estruturaClaro);
      r(xc * COL_PX + 3, topo + 8, 18, 12, 0xa9c8dc);
      r(xc * COL_PX + 3, topo + 8, 6, 12, 0xc8e0ee);
    }
  }
  // Laje e pilares das pontas (fachada). O grand lobby é um salão só: sem laje no meio.
  if (c === Est.Grand && y === 1) r(px, topo + INTERIOR_PX, w, LAJE_PX, COR.grand);
  else {
    r(px, topo + INTERIOR_PX, w, LAJE_PX, COR.estrutura);
    r(px, topo + INTERIOR_PX, w, 1, COR.estruturaClaro);
  }
  r(px, topo, 2, INTERIOR_PX, COR.estrutura);
  r(px + w - 2, topo, 2, INTERIOR_PX, COR.estrutura);
  // Cobertura: onde não há andar acima, uma platibanda
  if (y >= 0) {
    let xc = x0;
    while (xc < x1) {
      if (m.est(xc, y + 1) !== Est.Vazio) {
        xc++;
        continue;
      }
      let f = xc;
      while (f < x1 && m.est(f, y + 1) === Est.Vazio) f++;
      r(xc * COL_PX, topo - 4, (f - xc) * COL_PX, 4, COR.estrutura);
      r(xc * COL_PX, topo - 4, (f - xc) * COL_PX, 1, COR.estruturaClaro);
      xc = f;
    }
  }
}

type Ret = (x: number, y: number, w: number, h: number, cor: number, alpha?: number) => unknown;
/** Se o trecho começa / termina numa ponta do térreo. */
type Pontas = [boolean, boolean];

/** Portas de vidro nas pontas do trecho do térreo (entradas). */
function portas(r: Ret, pontas: Pontas, px: number, w: number, topo: number, altura: number, largura = 10): void {
  for (const [i, xp] of [px + 1, px + w - largura - 1].entries()) {
    if (!pontas[i]) continue;
    r(xp, topo + INTERIOR_PX - altura, largura, altura, COR.estruturaClaro);
    r(xp + 1, topo + INTERIOR_PX - altura + 1, largura - 2, altura - 1, 0xa9d8f0, 0.85);
    r(xp + largura / 2, topo + INTERIOR_PX - altura + 1, 1, altura - 1, COR.estruturaClaro);
  }
}

/** Centros (coluna) de enfeites a cada `passo` colunas, longe das portas. */
function enfeites(x0: number, x1: number, passo: number): number[] {
  const r: number[] = [];
  for (let xc = x0 + Math.floor(passo / 2); xc < x1 - 3; xc += passo) if (xc > x0 + 3) r.push(xc);
  // Trecho curto: um enfeite no meio.
  if (!r.length && x1 - x0 >= 10) r.push(Math.floor((x0 + x1) / 2));
  return r;
}

/** Lobby corporativo: piso escuro, balcão de recepção e catracas perto das portas. */
function desenharCorporativo(r: Ret, x0: number, x1: number, topo: number, px: number, w: number, pontas: Pontas): void {
  r(px, topo, w, INTERIOR_PX, COR.lobbyCorp);
  r(px, topo, w, 3, escurecer(COR.lobbyCorp, 0.7));
  r(px, topo + INTERIOR_PX - 4, w, 4, 0x3d4148);
  for (const xc of enfeites(x0, x1, 30)) {
    const bx = xc * COL_PX - 24;
    r(bx, topo + INTERIOR_PX - 15, 48, 11, 0x5a3e2b);
    r(bx, topo + INTERIOR_PX - 15, 48, 2, 0xc8a97e);
    r(bx + 12, topo + 5, 24, 5, 0x2c2c2a); // letreiro da empresa
    r(bx + 14, topo + 7, 20, 1, 0xd8dbe2);
  }
  // Catracas logo depois de cada porta.
  if (x1 - x0 >= 8) {
    for (const [i, base] of [px + 14, px + w - 30].entries()) {
      if (!pontas[i]) continue;
      for (let i = 0; i < 3; i++) r(base + i * 6, topo + INTERIOR_PX - 12, 2, 8, 0xc9ccd1);
    }
  }
  portas(r, pontas, px, w, topo, INTERIOR_PX - 6, 12);
}

/** Átrio: pé-direito duplo, árvores e mezanino com guarda-corpo no 1º andar. */
function desenharAtrio(r: Ret, x0: number, x1: number, y: number, topo: number, px: number, w: number, pontas: Pontas): void {
  r(px, topo, w, INTERIOR_PX, COR.atrio);
  const arvores = enfeites(x0, x1, 24);
  if (y === 0) {
    r(px, topo + INTERIOR_PX - 3, w, 3, 0xcfc6b2);
    for (const xc of arvores) {
      const cx = xc * COL_PX;
      r(cx - 2, topo + 2, 4, INTERIOR_PX - 7, 0x6b4a2e);
      r(cx - 10, topo + INTERIOR_PX - 5, 20, 3, 0x8c8270); // canteiro
      r(cx - 14, topo, 28, 10, 0x3b6d11);
      r(cx - 10, topo + 8, 8, 6, 0x639922);
      r(cx + 3, topo + 6, 8, 6, 0x639922);
    }
    portas(r, pontas, px, w, topo, INTERIOR_PX - 8);
  } else {
    r(px, topo, w, 3, escurecer(COR.atrio, 0.8));
    for (let xc = x0 + 1; xc + 3 < x1; xc += 5) r(xc * COL_PX + 2, topo + 5, 30, 14, 0xcfe6f2); // claraboias
    for (const xc of arvores) {
      const cx = xc * COL_PX;
      r(cx - 16, topo + 10, 32, INTERIOR_PX - 10, 0x3b6d11);
      r(cx - 20, topo + 18, 12, 10, 0x639922);
      r(cx + 8, topo + 16, 12, 10, 0x639922);
    }
    // Guarda-corpo do mezanino.
    r(px, topo + INTERIOR_PX - 8, w, 1, 0x5f5e5a);
    for (let xx = px + 4; xx < px + w; xx += 8) r(xx, topo + INTERIOR_PX - 8, 1, 8, 0x5f5e5a);
  }
}

/** Grand lobby: mármore escuro, colunas douradas, lustre, fonte e tapete vermelho. */
function desenharGrand(r: Ret, x0: number, x1: number, y: number, topo: number, px: number, w: number, pontas: Pontas): void {
  r(px, topo, w, INTERIOR_PX, COR.grand);
  const centros = enfeites(x0, x1, 30);
  // Colunas atravessam os dois andares.
  for (const xc of centros) {
    for (const dx of [-13, 12]) {
      const cx = (xc + dx) * COL_PX;
      r(cx, topo, 6, INTERIOR_PX, 0x4a4250);
      r(cx + 4, topo, 1, INTERIOR_PX, escurecer(0x4a4250, 0.7));
    }
  }
  if (y === 0) {
    r(px, topo + INTERIOR_PX - 4, w, 4, 0x7a1f2b); // tapete
    for (const xc of centros) {
      const cx = xc * COL_PX;
      r(cx - 18, topo + INTERIOR_PX - 12, 36, 8, 0x6e6676); // fonte
      r(cx - 14, topo + INTERIOR_PX - 14, 28, 2, 0x85b7eb);
      r(cx - 1, topo + 8, 2, INTERIOR_PX - 22, 0xb5d4f4, 0.9);
    }
    portas(r, pontas, px, w, topo, INTERIOR_PX - 4, 12);
    // Porteiro ao lado de cada porta.
    for (const [i, xp] of [px + 15, px + w - 18].entries()) {
      if (!pontas[i]) continue;
      r(xp, topo + INTERIOR_PX - 14, 3, 10, 0x2c2c2a);
      r(xp, topo + INTERIOR_PX - 17, 3, 3, 0xe0b48a);
    }
  } else {
    r(px, topo, w, 4, COR.dourado); // cornija
    for (const xc of centros) {
      const cx = xc * COL_PX;
      r(cx - 1, topo + 4, 2, 10, COR.dourado);
      r(cx - 14, topo + 14, 28, 6, 0xfac775); // lustre
      r(cx - 9, topo + 20, 18, 4, 0xef9f27);
      r(cx - 20, topo + 14, 2, 4, 0xfac775);
      r(cx + 18, topo + 14, 2, 4, 0xfac775);
    }
  }
}

/** Identifica o que um sprite desenha: tipo, posição e tamanho da unidade. */
function chaveUnidade(u: Unidade): string {
  return `${u.tipo}:${u.x}:${u.y}:${u.largura}:${u.altura}`;
}
