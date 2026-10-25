# Plano: Tatu na BR

Jogo de travessia com saque: o tatu sobe a tela faixa por faixa, cada faixa vencida aumenta o multiplicador,
e o jogador pode sacar ou arriscar mais uma. Se for atropelado, perde a aposta.
Segue a mesma estrutura do Pênalti na Várzea (`penalti.js` + `penalti.html` + `tools/penalti_assets.py`).

## 1. Imagens (todas em ~/Downloads)

| Arquivo em Downloads | Vira | Conteúdo |
|---|---|---|
| `Tatu na BR_ Desafio na Estrada.png` (1024x1536, sem transparência) | `assets/tatu/mockup.png` | tela inteira: estrada com 6 faixas, barraca de melancia, placas, painéis de aposta/risco |
| `Sprites de Corrida_ Veículos e Efeitos.png` (1536x1024, transparente) | `assets/tatu/sheet.png` | 10 veículos, quebra-molas normal/dourado, placa de madeira, buraco, cone, barreira, poeira, marca de pneu, moeda, pilha de moedas, brilho, explosão |
| `Folha de sprites do tatu aventureiro.png` (1536x1024, transparente) | `assets/tatu/chars.png` | 16 quadros do tatu: parado, piscando, olhando para os lados, andando, pulo, susto com o boné voando, bolinha, bolinha rolando, bolinha tonta, comemorando, dançando, com saco de moedas, joinha |
| `Kit de UI Tatu na BR.png` (1536x1024, transparente) | `assets/tatu/ui.png` | logo, faixas "SACOU!" e "ATROPELOU!", botões SACAR e ATRAVESSAR, 4 ícones de risco, painel de aposta, moeda |

A cópia `(1)` da tela é idêntica e será ignorada.

Observações sobre a arte:
- Na tela, o tatu aparece **de costas** e nenhum quadro da folha é de costas. Como os quadros estão de frente/lado,
  o tatu vai andar "de lado" pela estrada, com espelhamento horizontal quando trocar de direção.
- Os veículos estão virados para a direita. Nas faixas que andam para a esquerda, eles são espelhados com `scaleX(-1)`.
- Os carros, placas, tatu e textos da tela são removidos com LaMa (o mesmo retoque que o `lalau_assets.py` já usa).
  Assim sobram o fundo limpo e uma **faixa de asfalto que se repete**, usada para rolar a estrada quando há mais de 6 faixas.

## 2. Arquivos

| Arquivo | O que faz |
|---|---|
| `tools/tatu_assets.py` | recorta as 4 imagens, gera `.webp` em `assets/tatu/` (bg, faixa repetível, veículos, quadros do tatu, UI) e um `chars.json` com os tamanhos |
| `tatu.js` | só a matemática + auto-teste (`node tatu.js`), no padrão do `penalti.js` |
| `tatu.html` | tela, animações, sons e saldo, no padrão do `penalti.html` (`api/rtp.js`, `rodada.js`, `rtp-live.js`, `ao-vivo.js`) |
| `app.js` | `launchGame('tatu')` e incluir `'tatu'` em `JOGOS_COM_TESTE` |
| `index.html` | cartão do jogo na categoria "Outros" (`assets/card_grid_tatu.png` feito a partir da tela) |
| `api/src/rtp/rtp.controller.ts` | `tatu: { nome: 'Tatu na BR', fabrica: 0.90 }`, para aparecer no painel admin |

## 3. Matemática (`tatu.js`)

Cada nível tem uma chance fixa de passar por faixa (`p`) e um número de faixas. O multiplicador da faixa k é
`RTP / p^k`, arredondado **para baixo** em 2 casas, para nunca pagar acima do RTP. Com isso, sacar em qualquer faixa
devolve o RTP em média, e o RTP continua vindo do painel admin (`RTP_JOGOS.tatu`).

| Risco | Faixas | Chance por faixa | 1ª faixa | Última faixa |
|---|---|---|---|---|
| Fácil | 15 | 92% | 0.97x | ~3.1x |
| Médio | 12 | 80% | 1.12x | ~13x |
| Difícil | 9 | 65% | 1.38x | ~43x |
| Destemido | 6 | 45% | 2.00x | ~108x |

Na última faixa, o saque é automático. O auto-teste simula 1 milhão de séries por nível e por ponto de saque e
confere se o RTP medido fica a menos de 1% do configurado.

**A decidir:** a 1ª faixa do Fácil paga menos que 1x, o que é normal nesse tipo de jogo, mas pode confundir o jogador.
Se preferir, eu subo a chance para que a primeira faixa pague no mínimo 1.01x.

## 4. Tela e jogabilidade

- A tela segue a proporção da arte (1024x1536) e as posições usam `cqw`, como no Pênalti.
- Câmera: começa mostrando as 6 primeiras faixas. Quando o tatu passa da 4ª faixa visível, a estrada **rola para baixo**
  suavemente e entram novas faixas, repetindo a tira de asfalto.
- Em cada faixa, o quebra-molas com a placa do multiplicador. A próxima placa pulsa dourada, as já vencidas ficam verdes
  com ✓, e as mais distantes ficam apagadas.
- Painel de baixo: 4 ícones de risco (travados durante a série), aposta −/+ e atalhos 5/10/25/50, botões
  ATRAVESSAR e SACAR (SACAR mostra o valor atual, ex.: "SACAR R$ 21,00").
- O sorteio de cada faixa acontece **antes** da animação. A animação só encena o resultado.

## 5. Animações e efeitos

**Ambiente (sempre rodando)**
- Trânsito contínuo em todas as faixas: veículos aleatórios entram por um lado e saem pelo outro, com velocidade
  diferente por faixa, sacudindo de leve (balanço da suspensão), com rastro de velocidade e poeira atrás.
- A carroça do jegue anda devagar e balançando, a moto empina às vezes, e a viatura pisca o giroflex (azul/vermelho).
- Logo com brilho passando e balanço leve, melancias da barraca quicando, placas e mato balançando com o vento,
  partículas de poeira no ar e um raio de sol passando de vez em quando.

**Tatu**
- Parado: respira (escala leve), pisca, olha para os lados nervoso quando há carro perto.
- ATRAVESSAR: pequeno pulo para a próxima faixa (arco + sombra encolhendo), nuvem de poeira na decolagem e na
  aterrissagem, câmera dá um "tranco" leve.
- Quando passa: o trânsito da faixa **freia** na frente dele (pneu cantando + marca de pneu no asfalto), o quebra-molas
  acende dourado, a placa vira verde, aparece o multiplicador subindo em letras grandes, moedinhas saltam e o valor
  de SACAR conta para cima.
- Faixas finais do Difícil/Destemido: vinheta vermelha nas bordas e batida de coração no som, aumentando a tensão.

**Atropelou**
- Câmera desacelera (slow-motion), buzina com balão "BIIII", o tatu faz cara de susto e o boné voa.
- O veículo bate, aparece a explosão cartoon, a tela treme com flash vermelho, e o tatu vira **bolinha e rola de
  volta** para a calçada quicando, até parar tonto com estrelinhas girando.
- Entra a faixa "ATROPELOU!" com batida e balanço. A câmera volta ao começo e a série reinicia.

**Sacou**
- O tatu dança/comemora, o saco de moedas aparece, chuva de moedas com física (gravidade + quique), brilhos, faixa
  "SACOU!" com o valor contando, e as moedas voam até o saldo.
- Ganhos grandes (≥10x) ganham comemoração mais longa, com confete e tela dourada.

**Som** (sintetizado em WebAudio como no Pênalti, sem arquivos): motor dos carros passando de um lado ao outro do
estéreo, pulo, pneu cantando, buzina, batida, moedas, coração, comemoração. Tem botão de mudo.

**Desempenho:** tudo com `transform`/`opacity` em `requestAnimationFrame`, sem bibliotecas novas. Com
`prefers-reduced-motion`, sem tremidas e flashes.

## 6. Ordem de execução

1. `tools/tatu_assets.py`: recortar e gerar os `.webp`, conferindo visualmente cada recorte.
2. `tatu.js` + `node tatu.js` passando.
3. `tatu.html`: primeiro a tela estática e a jogabilidade, depois o trânsito, depois as animações do tatu, depois os efeitos e o som.
4. Conferir no navegador (Playwright): celular e desktop, cada nível de risco, saque, atropelamento, saldo e modo teste.
5. Ligar ao site (`app.js`, `index.html`, cartão, RTP no painel).
