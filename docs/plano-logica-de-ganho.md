# Plano: lógica de ganho dos jogos

## Regra que vale pra todos os jogos

1. **O servidor decide tudo.** Sorteio, resultado, prêmio e saldo são calculados na API. O site só recebe o resultado pronto e anima. Hoje tudo roda no navegador, e qualquer um altera o saldo pelo console.
2. **Cada jogo tem um RTP fixo e público** (quanto volta pro jogador, em média). A vantagem da casa é só a diferença até 100%. O RTP sai da matemática do jogo (tabela de pagamentos e probabilidades), não de ajuste por jogador.
3. **Proibido "controlar" o jogador:** nada de deixar ganhar no começo, apertar depois do depósito, mudar a chance por saldo, perfil ou horário, ou forçar "quase ganhou". Isso é fraude, e com dinheiro de verdade a SPA exige gerador de números certificado e RTP fixo por jogo.
4. **Sorteio com `crypto.randomInt`** no servidor, nunca `Math.random`.
5. **Todo jogo tem teste de simulação** que roda milhões de rodadas e falha se o RTP sair da faixa, como o `node slot.js` já faz.

## RTP alvo

| Jogo | Tipo | RTP alvo | Como chega nele |
|---|---|---|---|
| Capivara da Sorte | slot 3x3 | 97% (já está: 97,03%) | pesos dos símbolos + tabela de pagamento + bônus |
| Gatinho Flash | slot 5x3, 10 linhas, cascata | 97% (já está: 96,6–97,2%) | cascata x1→x5 + Sessão de Fotos (giros grátis x6→x18), teto 2.000x |
| Tigre Sortudo, Fortuna Tigre, Coelho da Sorte, Dragão Dourado, Sweet Bonanza | slots | 96–97% | o mesmo motor da Capivara, só muda a configuração |
| Mines | escolha de casas | 97% | prêmio = 0,97 ÷ chance de sobreviver |
| Aviator | crash | 97% | ponto de queda = 0,97 ÷ (1 − U) |
| Roleta | roleta europeia (um zero) | 97,3% | as regras normais já dão isso |
| Cartas | blackjack/bacará | definir depois | regras padrão do jogo |

Simulação com 2 milhões de rodadas (`crypto.randomInt`): Mines 97,03%, Aviator entre 96,9% e 97,2% (sacando em 1,5x, 2x ou 10x) e roleta 97,30%.

## Matemática de cada tipo

**Slots (um motor pra todos).** Cada slot vira um arquivo de configuração: símbolos com peso, tabela de pagamento, linhas, multiplicadores e bônus. O motor sorteia a grade, calcula as linhas e o prêmio. O `slot.js` da Capivara já é esse motor. Pra criar outro slot, basta mudar a configuração e rodar o teste de RTP até cair na faixa.

**Mines (grade 5x5, jogador escolhe quantas minas).** A chance de abrir `k` casas seguras com `m` minas é o produto de `(25 − m − i) / (25 − i)` para `i` de 0 a `k − 1`. O multiplicador pra sacar é `0,97 ÷ essa chance`. Exemplo: 3 minas e 5 casas abertas pagam 1,96x. As minas são sorteadas no servidor quando a rodada começa, e o site nunca recebe a posição delas antes do fim.

**Aviator (crash).** O servidor sorteia `U` entre 0 e 1 e calcula o ponto de queda `max(1,00; 0,97 ÷ (1 − U))`, arredondado pra baixo em 2 casas. A chance de passar de `x` é `0,97 ÷ x`, então sacar em qualquer ponto dá 97% em média. O ponto de queda é decidido antes da rodada, e o saque é validado pelo relógio do servidor, não do celular.

**Roleta.** Roleta europeia com um zero, pagamentos padrão (número 35:1, cor 1:1). A vantagem de 2,7% vem do zero.

## Carteira (saldo) no servidor

- Valores em **centavos inteiros** (sem número quebrado).
- O saldo é a soma de um **extrato**: depósito, aposta, prêmio, bônus e saque são lançamentos. Nada edita o saldo direto.
- Cada rodada roda numa **única transação do banco**: confere o saldo, debita a aposta, sorteia, credita o prêmio e grava a rodada. Se algo falha, nada fica pela metade.
- Cada rodada tem uma **chave única** enviada pelo site, pra um clique duplo não apostar duas vezes.
- **Limites:** aposta mínima e máxima por jogo, e prêmio máximo por rodada (por exemplo 5.000x a aposta), pra proteger o caixa.

## Novas tabelas na API (Prisma)

- `Transacao`: usuário, tipo (DEPOSITO, APOSTA, PREMIO, BONUS, SAQUE), valor em centavos, rodada ligada, data.
- `Rodada`: usuário, jogo, aposta, prêmio, resultado em JSON (grade, minas, ponto de queda), semente do sorteio, estado (ABERTA/FECHADA), data.
- `User` ganha `saldoCentavos` (cópia do extrato, atualizada na mesma transação).

## Rotas novas

| Rota | O que faz |
|---|---|
| `GET /carteira` | saldo e extrato |
| `POST /jogos/:jogo/rodada` | slots e roleta: `{ aposta, chave }` → resultado + prêmio + saldo novo |
| `POST /jogos/mines/iniciar`, `/abrir`, `/sacar` | rodada que dura várias jogadas |
| `POST /jogos/aviator/apostar`, `/sacar` | idem, com horário do servidor |

## XP e nível

- XP vem do **valor apostado** (por exemplo 1 XP a cada R$ 0,10), nunca do valor perdido. Assim o nível não premia perder.
- O nível e o VIP já são calculados em `api/src/profile/levels.ts`.

## Jogo responsável (obrigatório com dinheiro real)

- Limite de depósito, de perda e de tempo definido pelo próprio jogador.
- Pausa e autoexclusão.
- Histórico de rodadas visível pro jogador.
- Só maiores de 18 (o cadastro já valida).

## Fases

1. **Carteira + Capivara no servidor.** Tabelas `Transacao` e `Rodada`, `GET /carteira`, `POST /jogos/capivara/rodada` usando o motor do `slot.js`. O site para de mexer no saldo e só anima o que a API manda. Teste: RTP de 1 milhão de rodadas pela própria rota.
2. **Motor de slots configurável.** Cada slot do site vira uma configuração com seu teste de RTP.
3. **Mines e Aviator.** Rodadas com estado e saque validado no servidor.
4. **Roleta e cartas.**
5. **Transparência e controle.** Sorteio verificável (semente do servidor com hash publicado antes da rodada + semente do jogador), relatório de RTP real × teórico por jogo e ferramentas de jogo responsável.

## Decisões pendentes

- RTP alvo: 97% em todos, ou diferente por jogo?
- Prêmio máximo por rodada.
- Aposta mínima e máxima.
- Créditos fictícios ou dinheiro real. Dinheiro real no Brasil exige autorização da Secretaria de Prêmios e Apostas (Lei 14.790/2023), empresa brasileira, verificação de identidade e jogos certificados por laboratório credenciado. Até lá, o site deve continuar com créditos fictícios.
