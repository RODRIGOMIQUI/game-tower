// Desenho do mundo com PixiJS. Arte provisória: retângulos nas cores da paleta
// (docs/direcao-de-arte.md §8). Só redesenha estrutura/unidades quando o mundo muda.
import { Application, Container, Graphics, Text } from 'pixi.js';
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
};

export class Cena {
  readonly camera = new Camera();
  private readonly ceu = new Graphics();
  private readonly mundoBase = new Container();
  private readonly mundoTopo = new Container();
  private readonly terreno = new Graphics();
  private readonly estrutura = new Graphics();
  private readonly unidades = new Graphics();
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
    this.mundoBase.addChild(this.terreno, this.foraDoLote, this.estrutura, this.unidades, this.camadaG, this.dinamicaC, this.alertas, this.rotulos);
    this.dinamica = new CamadaDinamica(this.dinamicaC);
    this.mundoTopo.addChild(this.grade, this.fantasma);
    app.stage.addChild(this.ceu, this.fogos, this.mundoBase, this.noite, this.mundoTopo);
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
        const px = x * COL_PX;
        const w = (fim - x) * COL_PX;
        g.rect(px, topo, w, INTERIOR_PX).fill(COR_INTERIOR[c] ?? COR.interiorVazio);
        g.rect(px, topo + INTERIOR_PX, w, LAJE_PX).fill(COR.estrutura);
        g.rect(px, topo, 1, INTERIOR_PX).fill(COR.estruturaClaro);
        g.rect(px + w - 1, topo, 1, INTERIOR_PX).fill(COR.estruturaClaro);
        x = fim;
      }
    }

    this.mundoAtual = m;
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
    this.redesenharUnidades();
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

  private redesenharUnidades(): void {
    const m = this.mundoAtual;
    const gu = this.unidades.clear();
    if (!m) return;
    for (const u of m.unidades.values()) desenharUnidade(gu, u, this.situacoes.get(u.uid));
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

  receberDinamica(d: Dinamico, agora: number): void {
    this.dinamica.receber(d, agora);
  }

  desenharDinamica(agora: number, m: Mundo): void {
    this.dinamica.desenhar(agora, m, this.camera.escala);
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

function desenharUnidade(g: Graphics, u: Unidade, s: Situacao | undefined): void {
  if (ehElevador(u.tipo)) return desenharPoco(g, u);
  if (ehEscada(u.tipo)) return desenharEscada(g, u);
  let cor = COR_CATEGORIA[tipo(u.tipo).categoria];
  const vaga = s?.situacao === 0;
  const suja = s?.situacao === 3;
  const pragas = s?.situacao === 4;
  if (vaga) cor = misturar(cor, COR.vago, 0.6);
  else if (suja) cor = misturar(cor, COR.sujo, 0.55);
  else if (pragas) cor = misturar(cor, COR.pragas, 0.65);
  const r = retanguloUnidade(u);
  g.rect(r.x, r.y, r.w, r.h).fill(cor);
  g.rect(r.x + 1, r.y + 1, r.w - 2, 3).fill(escurecer(cor, 0.8)); // teto
  g.rect(r.x + 2, r.y + r.h - 12, 3, 12).fill(escurecer(cor, 0.55)); // porta
  g.rect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1).stroke({ width: 1, color: escurecer(cor, 0.6) });
  if (pragas) {
    // Bichinhos pelo chão
    for (let i = 0; i < Math.floor(r.w / 6); i++) g.rect(r.x + 3 + i * 6, r.y + r.h - 3 - (i % 2) * 4, 2, 1).fill(0x1e2129);
  }
  if (vaga && r.w >= 24) {
    // Placa "vago / à venda"
    const px = r.x + r.w / 2 - 6;
    g.rect(px, r.y + 10, 12, 7).fill(0xffffff);
    g.rect(px + 2, r.y + 12, 8, 1).fill(COR.estrutura);
    g.rect(px + 2, r.y + 14, 5, 1).fill(COR.estrutura);
  }
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
  for (let y = u.y; y < u.y + u.altura; y++) {
    const t = topoDoAndar(y);
    g.rect(x + 1, t + INTERIOR_PX, w - 2, LAJE_PX).fill(COR.estrutura);
    if (!expresso || y <= 0) g.rect(x - 1, t + 8, 2, INTERIOR_PX - 8).fill(COR.portaPoco);
  }
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
