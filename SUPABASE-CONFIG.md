# Configurar Supabase

1. Abra o painel do Supabase.
2. Entre no projeto.
3. Va em Project Settings > API.
4. Copie a Project URL para `url` em `supabase-config.js`.
5. Copie a chave `anon public` para `anonKey` em `supabase-config.js`.
6. Rode o conteudo de `supabase-schema.sql` no SQL Editor do Supabase.
7. Se o projeto ja existe e voce quer apenas liberar IDs unicos e pagamentos da casa, rode tambem `supabase-tabelas-painel.sql`.
8. Para o painel web mostrar as acoes de configuracao, rode `supabase-promover-admin.sql`. Ele promove o primeiro usuario cadastrado para admin.

Exemplo:

```js
window.SUPABASE_CONFIG = {
    url: "https://yadzaradfcojbrxpdahk.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhZHphcmFkZmNvamJyeHBkYWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NTc5OTUsImV4cCI6MjEwNzMzMzk5NX0.3K7VDzuPn3RMNMhQq4lJjA-5pMhmK0__INsYRY6s1Lo"
};
```

Importante: nao use a `service_role key` no frontend. Ela tem permissao administrativa e deve ficar somente em servidor seguro.
