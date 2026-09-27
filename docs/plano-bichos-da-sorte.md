# Plano: Bichos da Sorte (sorteio de bichos com resultado na hora)

## A ideia

Jogo inspirado no jogo do bicho, que todo brasileiro conhece: escolhe um bicho ou um número, aposta e **vê o sorteio na hora**, com animação. Nome sugerido: **Bichos da Sorte** (não usar "jogo do bicho" no nome).

## Regras

**25 bichos**, cada um com 4 dezenas. A dezena é o final do número sorteado:

| # | Bicho | Dezenas | # | Bicho | Dezenas |
|---|---|---|---|---|---|
| 1 | Avestruz | 01 02 03 04 | 14 | Gato | 53 54 55 56 |
| 2 | Águia | 05 06 07 08 | 15 | Jacaré | 57 58 59 60 |
| 3 | Burro | 09 10 11 12 | 16 | Leão | 61 62 63 64 |
| 4 | Borboleta | 13 14 15 16 | 17 | Macaco | 65 66 67 68 |
| 5 | Cachorro | 17 18 19 20 | 18 | Porco | 69 70 71 72 |
| 6 | Cabra | 21 22 23 24 | 19 | Pavão | 73 74 75 76 |
| 7 | Carneiro | 25 26 27 28 | 20 | Peru | 77 78 79 80 |
| 8 | Camelo | 29 30 31 32 | 21 | Touro | 81 82 83 84 |
| 9 | Cobra | 33 34 35 36 | 22 | Tigre | 85 86 87 88 |
| 10 | Coelho | 37 38 39 40 | 23 | Urso | 89 90 91 92 |
| 11 | Cavalo | 41 42 43 44 | 24 | Veado | 93 94 95 96 |
| 12 | Elefante | 45 46 47 48 | 25 | Vaca | 97 98 99 00 |
| 13 | Galo | 49 50 51 52 | | | |

**Sorteio:** 5 prêmios (1º ao 5º), cada um uma milhar de 0000 a 9999, sorteada no servidor com `crypto.randomInt`.

## Apostas e pagamentos (RTP 96%)

O jogo de rua paga pouco: grupo 18x (72%), dezena 60x (60%), centena 600x (60%) e milhar 4.000x (40%). Aqui ele fica **bem mais justo e igual em todas as apostas: 96%**. Isso é argumento de venda.

| Aposta | Ganha se… | Chance | Paga |
|---|---|---|---|
| Grupo (cabeça) | o bicho sai no 1º prêmio | 1 em 25 | **24x** |
| Grupo 1º ao 5º | o bicho sai em qualquer prêmio | 1 em 5,4 | **5,2x** |
| Duque de grupo | os 2 bichos saem entre os 5 | 1 em 35 | **34x** |
| Terno de grupo | os 3 bichos saem entre os 5 | 1 em 295 | **280x** |
| Dezena (cabeça) | os 2 últimos números do 1º prêmio | 1 em 100 | **96x** |
| Centena (cabeça) | os 3 últimos | 1 em 1.000 | **960x** |
| Milhar (cabeça) | os 4 números | 1 em 10.000 | **9.600x** |

Chances calculadas pela fórmula exata. O duque também foi conferido por simulação (1 em 35,2).

**Proteção do caixa:** a milhar paga 9.600x, acima do teto de 2.000x dos slots. Então ela tem **aposta máxima baixa** (por exemplo R$ 1, prêmio máximo R$ 9.600). A centena fica com máximo de R$ 2.

## Visual (o que faz ele ser bonito)

- **Tema:** noite de festa brasileira: luzinhas penduradas, bandeirinhas e o verde/dourado do Orama.
- **Arte dos 25 bichos** no mesmo estilo 3D fofo da capivara, gerada no ChatGPT. Pedir **uma imagem por bicho**, com fundo transparente e espaço em volta, pra não cortar como aconteceu nos sprites.
- **Tela de aposta:**
  - grade 5×5 com os 25 bichos, mostrando as dezenas embaixo; tocar no bicho seleciona;
  - abas para o tipo de aposta (Grupo, Duque, Terno, Dezena, Centena, Milhar); nas de número aparece um teclado numérico;
  - o prêmio possível aparece antes de apostar ("Se sair, você ganha R$ 24,00").
- **Sorteio na hora:**
  1. Cinco "globos" de números giram, um prêmio de cada vez, do 5º ao 1º, pra guardar a emoção pro final.
  2. Cada milhar para dígito a dígito, como um rolo de slot.
  3. A carta do bicho sorteado **vira** com animação e som.
  4. Se o jogador acertou, a carta brilha, e a capivara da comemoração (os sprites que já temos) aparece com o valor.
- **Painel de resultados:** os últimos sorteios no estilo "resultado do dia", com o bicho e a milhar. Dá o clima do jogo de rua.
- **Palpites rápidos:** "bicho do dia", "repetir última aposta" e "meus bichos favoritos".

## Status (26/09/2026)

Fases 1, 3 e 4 feitas: `bichos.js` (motor + teste), `bichos.html` (tela) e card no site. Os bichos ainda são emoji; quando a arte chegar, é só preencher `img` em `ANIMALS` no `bichos.js`.

## Fases

1. **Motor (`bichos.js`):** sorteio, conferência de cada tipo de aposta e pagamento. Teste de simulação que falha se algum tipo sair de 95–97%.
2. **Arte:** você gera os 25 bichos no ChatGPT, e eu recorto, padronizo e monto as cartas.
3. **Tela:** escolher bicho ou número, apostar, animação do sorteio, prêmio e painel de resultados.
4. **Integração com o site:** card "Bichos da Sorte" e o mesmo saldo do site, igual aos outros jogos.
5. **Servidor:** o sorteio e o saldo passam pra API, junto com os outros jogos (fase 1 do plano de ganhos).

## Atenção: legalidade

- O **jogo do bicho tradicional é contravenção penal** no Brasil (Lei das Contravenções Penais, art. 58) e **não está entre as apostas autorizadas** pela Lei 14.790/2023.
- Uma versão **online com dinheiro de verdade** só poderia existir dentro de um operador autorizado pela Secretaria de Prêmios e Apostas, como jogo online certificado. Mesmo assim, lembrar o "jogo do bicho" no nome e na propaganda pode trazer problema. Por isso o nome sugerido é "Bichos da Sorte".
- Com **créditos fictícios**, como o site está hoje, não tem problema.
