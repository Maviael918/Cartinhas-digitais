# Cartinhas no Dropbox

Use o Dropbox como banco de arquivos das imagens das cartinhas. O Supabase continua sendo o banco do sistema, guardando os dados da carta e o link da imagem no campo `public.cards.image_path`.

## Fluxo recomendado

1. Envie a imagem da cartinha para uma pasta no Dropbox, por exemplo `Cartinhas digitais/cartinhas`.
2. No Dropbox, crie e copie o link compartilhado da imagem.
3. No painel admin, cole esse link no campo `Imagem da carta`.
4. Ao salvar, o sistema converte links do Dropbox para `dl.dropboxusercontent.com`, que funciona melhor dentro de `<img>`.
5. A validacao da cartinha continua pelo ID unico em `public.card_codes`.

## Onde fica cada coisa

- `public.cards`: dados da carta e link da imagem em `image_path`.
- `public.card_codes`: IDs unicos impressos/QR das cartinhas fisicas.
- `public.inventory`: cartinhas ja validadas por jogadores.
- `public.scans`: historico das leituras/validacoes.
- Dropbox: arquivos `.jpg`, `.jpeg` ou `.png` das cartinhas.

## Consulta para conferir uma carta

```sql
select
  number,
  name,
  image_path,
  created_at
from public.cards
order by number;
```

## Atualizar uma carta ja cadastrada com link do Dropbox

```sql
update public.cards
set image_path = 'https://dl.dropboxusercontent.com/scl/fi/SEU_ARQUIVO/cartinha.png?rlkey=SUA_CHAVE'
where number = '004';
```

## Conferir cartinhas validadas

```sql
select
  cc.code,
  cc.claimed_at,
  c.number,
  c.name,
  c.image_path,
  p.name as jogador,
  p.email
from public.card_codes cc
join public.cards c on c.id = cc.card_id
left join public.profiles p on p.id = cc.claimed_by
order by cc.created_at desc;
```
