// Jogos salvos: JSON comprimido (gzip) guardado no IndexedDB do navegador.
// Roda dentro do Worker, longe do thread de render.
import type { MetaSave, Save } from '../sim/jogo';

const BANCO = 'gametower';
const LOJA = 'saves';

export interface SlotSalvo {
  slot: string;
  meta: MetaSave;
  /** Momento real em que foi salvo (ms desde 1970). */
  quando: number;
  bytes: number;
}

interface Registro extends SlotSalvo {
  dados: ArrayBuffer;
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA, { keyPath: 'slot' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

async function transacao<T>(modo: IDBTransactionMode, f: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  return new Promise((ok, erro) => {
    const req = f(db.transaction(LOJA, modo).objectStore(LOJA));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

export async function comprimir(save: Save): Promise<ArrayBuffer> {
  const fluxo = new Blob([JSON.stringify(save)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(fluxo).arrayBuffer();
}

export async function descomprimir(dados: ArrayBuffer): Promise<Save> {
  const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(fluxo).text()) as Save;
}

export async function gravar(slot: string, save: Save): Promise<void> {
  const dados = await comprimir(save);
  const r: Registro = { slot, meta: save.meta, quando: Date.now(), bytes: dados.byteLength, dados };
  await transacao('readwrite', (l) => l.put(r));
}

export async function ler(slot: string): Promise<Save | null> {
  const r = await transacao<Registro | undefined>('readonly', (l) => l.get(slot));
  return r ? descomprimir(r.dados) : null;
}

export async function listar(): Promise<SlotSalvo[]> {
  const todos = await transacao<Registro[]>('readonly', (l) => l.getAll());
  return todos.map(({ slot, meta, quando, bytes }) => ({ slot, meta, quando, bytes }));
}
