# Orama API

Cadastro, login e perfil em NestJS 12 + Prisma 7 + PostgreSQL.

## Rodar

```bash
npm install          # também gera o cliente do Prisma
cp .env.example .env # e preencha JWT_SECRET e as chaves Pix (Pluggou)
npm run db:deploy    # cria as tabelas no Postgres de DATABASE_URL
npm run start:dev    # http://localhost:3000
npm test             # testes e2e (usa test.db separado)
```

Mudou `prisma/schema.prisma`? Rode `npm run db:migrate`.

## Rotas

Rotas com 🔒 precisam do header `Authorization: Bearer <accessToken>`.

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/auth/cadastro` | `nome, cpf, email, celular, nascimento (AAAA-MM-DD), senha, aceitouTermos` | `{ accessToken, user }` |
| POST | `/auth/login` | `login` (e-mail ou CPF), `senha` | `{ accessToken, user }` |
| POST | `/auth/logout` 🔒 | – | 204, derruba todas as sessões |
| GET | `/perfil` 🔒 | – | perfil |
| PATCH | `/perfil` 🔒 | `nome?, celular?` | perfil |
| PATCH | `/perfil/senha` 🔒 | `senhaAtual, novaSenha` | `{ accessToken, user }` (token novo) |
| DELETE | `/perfil` 🔒 | `senha` | 204, apaga a conta |
| GET | `/avatars/padrao.png` | – | foto de perfil padrão |
| POST | `/depositos` | `amountCents, buyerName, buyerDocument, buyerPhone, buyerEmail?` | cobrança Pix (Pluggou por padrão) com `id`, `pixEmv`, `status` |
| GET | `/depositos/:id` | – | status atualizado da cobrança; `paid` confirma o depósito |

## Pix

As credenciais nunca ficam no navegador. O provedor das cobranças novas vem de `PIX_PROVEDOR`:

```bash
PIX_PROVEDOR=pluggou            # padrão; ou gatebox

# Pluggou — https://docs.pluggoucash.com (chave do tipo "entradas" basta)
PLUGGOU_PUBLIC_KEY=pk_live_...
PLUGGOU_SECRET_KEY=sk_live_...
# PLUGGOU_BASE_URL=https://api.pluggoutech.com/api  (padrão)

# Gatebox — a mesma do sinuca-mult
PIX_CLIENT_ID=...
PIX_CLIENT_SECRET=...
```

O site cria o PIX em `POST /depositos`, mostra o `pixEmv` para copiar e consulta `GET /depositos/:id` a cada 3 segundos. O id diz quem gerou a cobrança, então a consulta sempre vai ao provedor certo, mesmo depois de trocar `PIX_PROVEDOR`:

| id | provedor | consulta |
| --- | --- | --- |
| `plg-<uuid>` | Pluggou | `GET /transactions/<uuid>` |
| `orama-<hex>` | Gatebox | `GET /pix/invoice?externalId=...` (expira em 1 h) |
| outro | BullsCash (antigos, só se `BULLSCASH_*` estiver no .env) | `GET /deposit/<id>` |

Só vira `paid` quando o provedor confirma e entrou pelo menos o valor cobrado.

Erro de validação (400) e conta repetida (409) vêm com uma mensagem por campo:

```json
{ "message": "Dados inválidos", "erros": { "cpf": "CPF inválido", "senha": "Mínimo 8 caracteres, com letras e números" } }
```

O perfil nunca devolve a senha. O CPF vem mascarado (`***.982.247-**`) e o nível é calculado pelo XP (`nivel, vip, xpNivelAtual, xpProximoNivel, progresso`).

## Segurança

- Senha com scrypt (`node:crypto`), salt aleatório e comparação em tempo constante.
- JWT com `tokenVersion`: logout e troca de senha invalidam os tokens antigos.
- Login e cadastro limitados a 10 tentativas/min por IP (demais rotas: 120/min).
- Login com usuário inexistente e com senha errada dão a mesma resposta, no mesmo tempo.
- Em produção, defina `CORS_ORIGIN` com o domínio do site.
