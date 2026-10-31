# Publicação

## Pré-requisitos
- Node.js e npm compatíveis com o projeto, dependências instaladas com `npm install` e Firebase CLI instalado (`npm install -g firebase-tools`).
- Firebase CLI autenticado e acesso ao projeto `maduacessorios-b8d44` (ou ao projeto explicitamente escolhido).
- Projeto Supabase configurado com as migrations revisadas.
- Domínio final da aplicação autorizado na Edge Function `admin-users`.

## Fluxo sugerido
1. Instale e autentique o Firebase CLI:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase projects:list
   ```

2. Confirme o projeto padrão `maduacessorios-b8d44` em `.firebaserc` e selecione-o:

   ```bash
   firebase use maduacessorios-b8d44
   ```

3. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY`) no ambiente que executará o build. `VITE_WHATSAPP_NUMBER` é opcional e serve somente como fallback se a configuração persistida ainda não existir. O Firebase Hosting não injeta variáveis no frontend; localmente, use `.env.production.local`, que não deve ser commitado.
4. Gere o build e publique somente o Hosting:

   ```bash
   npm run build
   firebase deploy --only hosting --project maduacessorios-b8d44
   ```

   O Firebase Hosting serve os arquivos de `dist`; `firebase.json` mantém o rewrite SPA para `index.html` e os headers existentes do manifest e service worker.
5. Para testar sem publicar a versão final, crie e publique um canal de preview com `firebase hosting:channel:deploy <nome-do-canal>`. Configure os valores de build para um projeto Supabase separado, se possível.
6. Configure o domínio publicado em Supabase Auth e na lista `ADMIN_APP_ORIGINS` da Edge Function `admin-users`.
7. Aplique migrations e implante `admin-users` seguindo [ADMIN_SETUP.md](./ADMIN_SETUP.md).
8. Em Supabase Storage, confirme que o limite global de upload é pelo menos 10 MB. O bucket `product-images` configura esse limite por objeto e aceita JPG, PNG e WebP.

## Limites e comportamento
- O tamanho máximo configurado pelo app e pelo bucket é 10 MB por imagem. A configuração global e as cotas efetivas dependem do plano do projeto.
- O checkout é click-to-chat. O sistema não processa pagamentos nem registra pedidos.
- Não faça deploy da aplicação, migrations ou Edge Functions sem revisar e autorizar cada operação.
