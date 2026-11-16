# GameTower — Beta fechado (1.0.0-beta.1)

O balanceamento automático (bots) já fez o possível; agora o jogo precisa de
pessoas jogando. Este guia é para organizar o beta.

## 1. Gerar e distribuir

```bash
npm run build      # gera dist/ (site estático, caminhos relativos)
npx vite preview   # testa o build em http://localhost:4173
```

`dist/` funciona em qualquer hospedagem estática (GitHub Pages, Netlify,
Cloudflare Pages, um servidor próprio). Com HTTPS, o navegador oferece
**Instalar GameTower** e o jogo passa a abrir **offline** depois da primeira visita.

Para o beta ficar fechado, use uma hospedagem com senha/link privado ou mande o
`dist/` compactado para os testadores rodarem `npx vite preview` (ou qualquer
servidor estático).

## 2. O que pedir para cada testador

1. Jogar uma **carreira** por pelo menos 1–2 horas (velocidade livre).
2. Jogar **um cenário** à escolha.
3. Responder (5 minutos):
   - Em que momento ficou com vontade de parar? Por quê?
   - O começo (primeiros 30 min) foi claro? O tutorial ajudou?
   - Os elevadores: deu para entender por que havia fila e o que fazer?
   - Alguma estrela demorou demais ou veio fácil demais?
   - Algum evento foi irritante ou injusto (incêndio, pane, pragas)?
   - A música e os sons agradaram? Volume ok?
   - Bugs: o que aconteceu, e se possível o arquivo `.gametower`
     (Menu → Exportar para arquivo) logo depois.
4. Opcional: um print do **Menu → Relatórios** no fim da sessão.

O arquivo `.gametower` reproduz o estado exato (a simulação é determinística):
com ele dá para investigar qualquer bug relatado.

## 3. O que observar nos números

Metas atuais (bots, `docs/economia.md` §4.3). Se a maioria dos testadores
divergir muito, ajuste:

| Sintoma | Alavanca |
|---|---|
| Começo lento / desistem cedo | caixa inicial (`DINHEIRO_INICIAL`), meta da 2★ |
| Meio do jogo arrastado | metas de população da 3★/4★ (`progressao.ts`), aluguel do escritório |
| Filas impossíveis | `VEL_ELEVADOR`, `CAPACIDADE`, paciências (`pessoas.ts`) |
| Inquilinos saindo sem motivo claro | limites de satisfação por preço (`SATISFACAO_MINIMA`) |
| Eventos frequentes demais | chances em `eventos.ts` |
| Dinheiro sobrando no fim | criar novos gastos (pós-1.0) |

Todos os valores de unidades ficam em `docs/dados/unidades.csv` (`npm run data`).

## 4. Desktop (opcional)

O PWA instalado já roda em janela própria, como um aplicativo. Um pacote
nativo (para lojas como a Steam) pode ser feito com **Tauri**, que exige o
toolchain do Rust e as bibliotecas WebKitGTK do sistema (não instalados nesta
máquina). Isso fica para depois do beta, se fizer sentido.
