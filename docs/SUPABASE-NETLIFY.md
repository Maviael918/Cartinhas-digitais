# Supabase e Netlify

## Configuração do Racker

- Site selecionado: **https://cartinhas01.netlify.app**.
- Supabase: **https://yadzaradfcojbrxpdahk.supabase.co**.
- Página de entrada: `index.html`, na raiz do projeto.
- Arquivos publicados: somente o conteúdo gerado em `dist/`.
- API: `netlify/functions/api.mjs`, atendendo `/api/*` e `/health`.

```text
Painel web ───────┐
                 ├── HTTPS /api/* → Netlify Function → Supabase
Android pareado ──┘
```

O painel e o aplicativo Android usam a API do Racker. Somente essa API acessa o banco com a chave secreta. O login é próprio do Racker, com uma senha administrativa por instalação.

## 1. Banco de dados

Execute no SQL Editor do Supabase:

`supabase/migrations/202611060001_racker.sql`

| Tabela | Finalidade |
| --- | --- |
| `racker_devices` | Aparelhos e hashes de tokens |
| `racker_readings` | Leituras autorizadas |
| `racker_sessions` | Sessões do painel |
| `racker_pairing_codes` | Códigos temporários como hash |
| `racker_rate_limits` | Limites compartilhados de tentativas |

A migração é transacional, atua somente em objetos `racker_*` e pode ser aplicada novamente sem apagar registros. As tabelas têm RLS habilitada e recusam acesso direto de `anon` e `authenticated`. As RPCs permitem execução somente por `service_role`.

As sessões e os códigos ficam no banco para funcionar entre instâncias do Netlify. Logout e remoção do aparelho valem entre instâncias. Alterar `ADMIN_PASSWORD` e implantar essa configuração invalida os cookies da senha anterior.

## 2. Variáveis privadas no Netlify

Configure no site selecionado, com escopo disponível para Functions:

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://yadzaradfcojbrxpdahk.supabase.co` |
| `SUPABASE_SECRET_KEY` | Chave secreta `sb_secret_...` do projeto Supabase |
| `ADMIN_PASSWORD` | Senha própria de 12 a 256 caracteres |

Também é aceito `SUPABASE_SERVICE_ROLE_KEY` para uma instalação que ainda use a chave legada `service_role`. Uma chave pública `anon` não tem a permissão necessária.

Configure a chave diretamente no ambiente do servidor. Ela não deve entrar no `index.html`, no JavaScript público, no Android, no Git ou no chat. [Documentação das chaves](https://supabase.com/docs/guides/getting-started/api-keys).

Sem a configuração obrigatória, a função retorna HTTP 503 com `CONFIGURATION_REQUIRED`. Ela não usa um arquivo temporário como alternativa ao banco online.

## 3. Publicação

Use a raiz deste projeto como pasta base da integração Git. `netlify.toml` define:

- Build: `npm run build`.
- Pasta pública: `dist`.
- Funções: `netlify/functions`.
- Node.js 22 e empacotamento com esbuild.
- Cabeçalhos de segurança para os arquivos estáticos.

O `index.html` permanece solto na raiz como arquivo-fonte e é copiado para `dist/` pelo build. Não publique a raiz inteira: ela contém a API, SQLs e arquivos de configuração.

Com a CLI oficial autenticada, vincule explicitamente o site existente e execute `netlify deploy --build --prod` a partir da raiz. A publicação precisa incluir os arquivos estáticos e as funções; enviar somente `index.html` ou arrastar apenas `dist/` não instala a API. [Configuração de Functions](https://docs.netlify.com/build/functions/configuration/).

## 4. Verificação online

1. Abra `https://cartinhas01.netlify.app/health`. O resultado deve conter `ok: true`, `service: "racker"`, `apiVersion: 1` e `storage: "supabase"`.
2. Entre no painel com `ADMIN_PASSWORD`.
3. Gere um código e pareie seu Android usando a origem `https://cartinhas01.netlify.app`.
4. Confirme o compartilhamento no aparelho e envie uma leitura manual.
5. Verifique o histórico, a pausa e a revogação.

O banco online não importa automaticamente aparelhos ou dados do arquivo local. Faça um novo pareamento ao trocar o armazenamento.

## Desenvolvimento local

O servidor usa `RACKER_STORAGE=auto` por padrão: com `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` configurada, seleciona Supabase; sem chave, usa o arquivo local de desenvolvimento. Para exigir o banco remoto, defina `RACKER_STORAGE=supabase`. Para desenvolvimento explicitamente local, use `RACKER_STORAGE=local`.

Copie `.env.example` para `.env` se precisar configurar a instância no computador. O servidor carrega esse arquivo ao iniciar. No Netlify, configure as variáveis diretamente no ambiente privado de Functions; o arquivo `.env` não é enviado ao Git. Não configure `HOST`, `PORT`, `TLS_CERT` ou `TLS_KEY` nas Functions; o Netlify fornece a entrada HTTPS.

Se faltar a senha do painel ou a chave do banco, o painel mostra uma tela de configuração com os nomes dos campos pendentes. Os valores privados não são retornados pela API. Depois de salvar as variáveis e realizar um novo deploy, use **Já configurei, verificar** para entrar no painel.

Os testes usam PostgreSQL local via PGlite e não alteram o banco remoto. A publicação e o teste do projeto remoto dependem da autenticação no provedor e da configuração das variáveis privadas.

## Publicação por Git

O Git local foi inicializado com a branch `main`. Para publicação contínua, crie um repositório privado no provedor Git de sua escolha, envie os arquivos do Racker e vincule esse repositório ao site existente no Netlify. Não envie `.env`, dados de aparelhos ou chaves privadas; os caminhos correspondentes estão no `.gitignore`.

O Netlify deve usar o comando `npm run build`, a pasta pública `dist` e as funções em `netlify/functions`. Essas opções já estão no `netlify.toml`. A publicação precisa incluir a API, não apenas a página HTML. [Publicação com Git ou CLI](https://docs.netlify.com/deploy/create-deploys/).

O Git transporta o código. A configuração do banco continua necessária: confirme a Project URL atual, aplique a migração e preencha as variáveis privadas no Netlify. O endereço do app deve ser a origem do painel publicado, e não a URL do Supabase.

Execute `npm run diagnostico` para conferir o servidor local, a API publicada, o endereço Supabase e a presença da credencial privada. O comando não imprime chaves nem envia dados do celular. Se a chave já estiver configurada, ele faz uma consulta sem dados pessoais para verificar se a RPC está acessível.
