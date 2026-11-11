# Racker

Painel web e aplicativo Android para acompanhar seu próprio celular, com autorização explícita no aparelho.

## Organização

O **`index.html` está na raiz**, junto de `app.js` e `styles.css`. O projeto anterior foi removido. A configuração de banco mantém o endpoint Supabase em `config/supabase.mjs`.

```text
index.html                 Entrada do painel web
.env                       Chave privada Supabase e senha do painel (fora do Git)
app.js                     Interface e chamadas à API
styles.css                 Estilos
server.mjs                 Servidor local
lib/                       API e adaptadores de armazenamento
config/                    Endpoints e destino de implantação
netlify/functions/         Função da API para Netlify
supabase/migrations/       SQL exclusivo do Racker
scripts/                   Builds do painel
test/                      Testes de integração
docs/                      Instruções de implantação
racker/android/            Aplicativo Android nativo
dist/                      Arquivos públicos gerados
```

## Executar no computador

Requer Node.js 22 ou superior.

```powershell
cd C:\Users\Estutante\Desktop\racker
npm start
```

Abra **http://127.0.0.1:3000** e use a senha exibida no terminal. No Windows, `ABRIR-PAINEL.cmd` abre um servidor ativo ou inicia um novo e mostra a senha. Mantenha o terminal do servidor aberto.

Abrir `index.html` diretamente permite ver a orientação de acesso, mas o painel real precisa da API. O Live Server não executa essa API. Sem `ADMIN_PASSWORD`, cada inicialização gera uma senha temporária. Para manter sua senha, defina a variável no ambiente ou em `.env`, com 12 a 256 caracteres. Use `.env.example` como modelo; `.env` não é versionado.

O arquivo privado **[.env](.env)** já foi criado para você preencher `SUPABASE_SECRET_KEY` e `ADMIN_PASSWORD`. Ele define `RACKER_STORAGE=supabase`; preencha os valores antes de reiniciar o servidor. Veja [as instruções dos campos](supabase/README.md). Para a versão publicada, importe essas variáveis no ambiente privado do Netlify e realize um novo deploy.

## Supabase e Netlify

Siga [o guia de implantação](docs/SUPABASE-NETLIFY.md).

O destino escolhido é **https://cartinhas01.netlify.app**. O Racker possui uma API em Netlify Functions e persistência em cinco tabelas `racker_*`. O acesso ao painel usa uma senha administrativa por instalação; não há cadastro público de usuários.

Ainda é necessário aplicar a migração no Supabase, configurar a chave secreta e a senha no ambiente do Netlify e publicar no site escolhido. A chave secreta fica somente no servidor. O comando de build não publica o site nem modifica o banco remoto.

```powershell
npm ci
npm test
npm run build
npm run check:function
npm run diagnostico
```

`npm run build` prepara o painel real em `dist/`; as funções são empacotadas a partir de `netlify/functions/`. O build inclui somente os arquivos públicos necessários. Não configure a raiz inteira como pasta pública do Netlify: ela também contém código de servidor e configuração privada.

`npm run build:demo` gera uma demonstração com dados fictícios. A demonstração não recebe dados do celular.

## Aplicativo Android

Projeto nativo: `racker/android/`. APK de teste: `racker/android/app/build/outputs/apk/debug/app-debug.apk`.

Requer Android 11 ou superior. Para recompilar, use Android Studio, JDK 17, SDK 35 e Gradle 8.14.3. Na pasta `racker/android/`, execute `./gradlew.bat assembleDebug` no Windows ou `sh ./gradlew assembleDebug` no Linux/macOS.

1. Instale o APK no seu Android.
2. Entre no painel e escolha **Conectar aparelho**.
3. Abra o app atualizado (0.3.0), informe somente o código de oito dígitos e o nome do aparelho. O endereço do painel já vem configurado.
4. Confirme o compartilhamento e toque em **Conectar meu Android**. O primeiro envio é automático e o painel seleciona o novo aparelho em poucos segundos. Depois, use **Sincronizar agora** quando quiser.
5. Para enviar a localização aproximada, marque a opção de envio manual e autorize a permissão do Android.

O APK lê o endereço de `config/deployment.json` (`siteUrl`) durante a compilação. A versão atual conecta diretamente a `https://cartinhas01.netlify.app`; não há campo para digitar servidor nem chave Supabase no aplicativo. Para mudar de hospedagem, altere esse arquivo e recompile o APK. Um vínculo da versão anterior com o mesmo servidor é preservado. Vínculos com outro servidor, inclusive local, precisam de um novo pareamento; dados antigos não são importados automaticamente.

O botão **Testar conexão com o servidor** é opcional e verifica a API já configurada, mostrando o armazenamento informado pelo servidor. A tela mantém os campos preenchidos quando você alterna para o navegador para buscar o código. O app só registra sucesso de sincronização após receber a confirmação da API. Durante o pareamento, o painel consulta novos aparelhos a cada três segundos; fora dele, atualiza a cada quinze segundos enquanto estiver visível.

Instalar o APK não inicia os envios por conta própria: abra o app e confirme o pareamento no primeiro uso. A localização continua opcional, com permissão do Android e envio manual. O painel local continua disponível para desenvolvimento; o APK distribuído usa o painel online por HTTPS.

## Dados e compartilhamento

- Bateria, carregamento, tipo de rede, versão do Android e histórico de leituras.
- Localização aproximada opcional, enviada manualmente com o app aberto e sua permissão.
- Envios automáticos de bateria/rede a cada aproximadamente 15 minutos, sujeitos ao agendamento do Android.
- O painel consulta a API a cada 15 segundos enquanto está visível; isso não força um envio do telefone.
- **Pausar envios** interrompe os próximos envios. Um envio já em trânsito pode chegar.
- **Remover** no painel revoga o token e apaga os registros do aparelho no servidor.
- Até dez aparelhos e 1.000 leituras por aparelho. Leituras com mais de 30 dias são removidas na próxima chamada à API.
- O painel mostra até 120 leituras; a exportação inclui todas as leituras retidas.

O modo local usa `data/devices.json`, ignorado pelo Git e sem criptografia adicional em disco. O modo Supabase persiste também sessões e códigos de pareamento. Tokens do servidor são armazenados como hash. No Android, o token fica nas preferências privadas do app; backups desses dados são desativados no manifesto.

No computador, o modo `auto` seleciona Supabase assim que a chave privada é configurada no ambiente ou em `.env`. Para exigir Supabase, use `RACKER_STORAGE=supabase`. As funções do Netlify usam sempre Supabase e mostram as configurações pendentes quando falta a chave ou a senha do painel.

O app não coleta mensagens, chamadas, fotos, áudio, câmera, senhas ou o conteúdo de outros apps. Não usa acessibilidade, administrador do dispositivo, leitura de notificações, SMS ou localização em segundo plano.

## Validação

Os testes cobrem a API local e a integração Netlify/Supabase com PostgreSQL local via PGlite: permissões, persistência entre instâncias, pareamento único, exportação, retenção e revogação. O APK de debug foi compilado e sua assinatura verificada.

A validação do banco remoto, a publicação, a revisão visual no navegador e o teste no aparelho real ainda precisam ser concluídos. Esta é uma instalação pessoal, não uma plataforma de múltiplos clientes.
