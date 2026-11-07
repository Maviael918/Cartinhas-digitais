# Configurar a integração do Racker

As chaves ficam no arquivo **[.env](../.env)**, na raiz do projeto. O servidor já está preparado para carregar esse arquivo ao iniciar.

Preencha os campos:

| Campo | O que colocar |
| --- | --- |
| `SUPABASE_URL` | A Project URL do seu projeto; o endereço atual já está preenchido. |
| `SUPABASE_SECRET_KEY` | A chave secreta `sb_secret_...`, obtida nas configurações de API do Supabase. |
| `ADMIN_PASSWORD` | Uma senha escolhida por você, com 12 a 256 caracteres. Essa é a senha de entrada do painel Racker. |

O arquivo já define `RACKER_STORAGE=supabase`, para exigir o banco online. Depois de preencher e salvar, reinicie o servidor com `npm start`. Se houver um processo antigo em execução, encerre-o antes de iniciar outro. Use `npm run diagnostico` para verificar a conexão sem imprimir as chaves.

## Netlify

O arquivo `.env` é privado e fica fora do Git. No site do Netlify, abra **Project configuration → Environment variables** e importe o `.env`, ou cadastre as variáveis acima manualmente. Os valores precisam estar disponíveis para **Functions** no ambiente de produção. Depois, faça um novo deploy.

`HOST` e `PORT` são usados no computador; não são necessários nas Functions. O Android recebe somente o endereço do servidor e o código de pareamento.

## Banco de dados

A migração está em `migrations/202611060001_racker.sql`. Se ela já foi executada no Supabase, preencher as credenciais não exige executar novamente o SQL.

### Correção ao gerar o código de pareamento

Se o painel entra normalmente, mas **Conectar aparelho** falha, a instalação pode estar com a versão anterior da função que limpava códigos sem filtro. O Supabase recusa essa operação com `DELETE requires a WHERE clause` (código `21000`).

No **SQL Editor do Supabase**, execute somente [202611070001_fix_pairing_safeupdate.sql](migrations/202611070001_fix_pairing_safeupdate.sql). A correção substitui a função de geração do código, mantém suas permissões e não desativa a proteção do banco. Ela não cria usuários por e-mail nem exige trocar a senha do painel. Pode ser aplicada novamente.
