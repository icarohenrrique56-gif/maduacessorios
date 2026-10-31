# Madu Acessórios

Aplicação de loja virtual premium, mobile-first e integrada ao WhatsApp para a marca Madu Acessórios.

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- React Router
- Lucide React
- Supabase-ready architecture

## Scripts

```bash
npm install
npm run dev
npm run build
npm test
```

## Visão geral
Este projeto entrega uma base funcional para loja pública e painel administrativo, com identidade visual em rosa pastel e foco em celular.

## Estrutura principal
- `src/App.tsx` — rotas e telas da loja e do painel
- `src/components/Navigation/` — navegação administrativa responsiva
- `src/context/` — estado compartilhado do carrinho
- `src/data/` — catálogo local e categorias
- `src/lib/` — comércio, Supabase e testes de regras
- `src/test/` — configuração de testes
- `public/assets/brand/` — logos e favicons da marca
- `docs/` — documentação e referências visuais do projeto

Os arquivos de identidade visual ficam organizados em `public/assets/brand/`. A loja usa `madu-logo-transparent.png`; o favicon e as variações SVG/WEBP permanecem no mesmo diretório.

## Firebase Hosting

O Firebase Hosting publica o build estático do Vite (`dist`) e direciona rotas da aplicação, como `/admin/login`, para `index.html`. Os arquivos estáticos existentes são servidos normalmente pelo Hosting. Este é o único destino de hospedagem documentado para produção.

### Aplicativo instalável (PWA)

A loja inclui `manifest.webmanifest`, ícones da marca, um botão de instalação e um service worker. Em HTTPS, o Chrome Android pode oferecer a instalação e abrir a loja em modo standalone; no iOS e em navegadores sem o prompt nativo, o botão mostra as instruções de instalação disponíveis. A navegação inferior aparece nas telas públicas em dispositivos móveis.

O service worker é registrado somente em builds de produção. Ele mantém o app shell para uma página offline informativa e armazena em cache apenas assets estáticos versionados; não armazena chamadas de API, autenticação, tokens, catálogo do Supabase nem imagens remotas de produtos. Operações que precisam do servidor continuam indisponíveis sem conexão. As versões antigas do cache do app são removidas na ativação da nova versão; quando uma atualização assume o controle, a interface oferece recarga explícita para não interromper formulários.

O manifest usa `display: standalone`, `display_override: ["standalone"]`, escopo `/` e ícones regulares e maskable. No Android, use a opção **Instalar app** do Chrome para criar uma instalação PWA. Se uma versão anterior tiver sido adicionada como atalho e ainda abrir com a barra do Chrome, remova esse atalho/aplicativo antigo e instale novamente após a atualização do site; “Adicionar à tela inicial” pode criar apenas um atalho em algumas versões do Chrome.

O projeto padrão está vinculado ao Firebase `maduacessorios-b8d44`. O `firebase.json` publica `dist`, mantém os headers de atualização do manifest/service worker e direciona rotas SPA para `index.html`. Para publicar, instale o Firebase CLI e autentique-se:

```bash
npm install -g firebase-tools
firebase login
firebase use maduacessorios-b8d44
npm run build
firebase deploy --only hosting --project maduacessorios-b8d44
```

O Firebase Hosting não compila o app nem injeta variáveis de ambiente. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY`) e `VITE_WHATSAPP_NUMBER` no ambiente de build antes de executar `npm run build` (por exemplo, em `.env.production.local`, que não deve ser commitado). Essas variáveis públicas são incorporadas ao frontend durante o build; nunca use `service_role`. Use `--project OUTRO_PROJECT_ID` para substituir o projeto padrão em um deploy específico. O service worker e o manifest também são publicados como arquivos estáticos do Firebase Hosting.

Após o primeiro deploy, adicione o domínio do Hosting (por exemplo, `https://SEU_PROJECT_ID.web.app`) aos Site URLs e Redirect URLs do Supabase Auth, conforme as rotas `/admin/login` e `/admin` descritas acima. O Firebase é usado somente para hospedar os arquivos estáticos; autenticação, dados e imagens continuam no Supabase.

### Variáveis de ambiente por ambiente

Configure as variáveis no ambiente que executa o build local ou no pipeline de CI que publica no Firebase Hosting:

- Desenvolvimento: use o projeto local ou um ambiente de desenvolvimento dedicado do Supabase.
- Produção: use o projeto Supabase oficial da MADU e a URL publicada no Firebase Hosting.

As variáveis públicas esperadas pelo app são:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica
# ou, em compatibilidade antiga:
# VITE_SUPABASE_ANON_KEY=sua-chave-anon
VITE_WHATSAPP_NUMBER=+5511999999999
```

Nunca configure `service_role` em qualquer `VITE_*` nem exponha segredos no frontend. Para testar uma versão sem alterar a produção, use canais de preview do Firebase Hosting e aponte o build para um projeto Supabase de testes, sempre que possível.

### Autenticação do Supabase (Site URL e redirects)

Para que o painel administrativo funcione corretamente, configure no Supabase Auth:

- Site URL: a URL de produção do Firebase Hosting ou o domínio customizado associado a ele.
- Redirect URLs adicionais: `https://<dominio-firebase-ou-customizado>/admin/login` e `https://<dominio-firebase-ou-customizado>/admin`. Inclua também URLs exatas de canais de preview do Firebase somente se forem usados para testar Auth.
- Recuperação de senha: use a rota `/admin/login`, que o app usa para finalizar o fluxo de reset.
- Convites de usuários e confirmação de e-mail: mantenha os domínios aprovados limitados ao domínio da MADU e aos canais de preview realmente usados.
- Autenticação administrativa: a aplicação usa `supabase.auth` para login, logout e reset de senha e verifica permissões em `admin_user_permissions`.

Em desenvolvimento local, inclua também `http://localhost:5173/admin/login` e `http://127.0.0.1:5173/admin/login` nos redirects autorizados. Evite permitir redirecionamentos arbitrários para domínios desconhecidos.

## Integração com Supabase

Para desenvolvimento local:

1. Instale o Docker (a Supabase recomenda pelo menos 7 GB de RAM para o stack local completo) e execute `npx supabase start`.
2. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_ANON_KEY` com a chave pública `ANON_KEY`. Para mostrar somente essa chave, use `npx supabase status -o env | grep '^ANON_KEY='`; não compartilhe a saída completa do status, que também contém credenciais locais privilegiadas.
3. Execute `npm run dev`. A API local fica em `http://127.0.0.1:54321`; o Supabase Studio local, quando iniciado, fica em `http://127.0.0.1:54323`.
4. Execute `npx supabase stop` quando terminar. O stack local não se vincula nem altera um projeto hospedado.

O schema, as categorias iniciais, índices, grants e policies RLS são aplicados em ordem pelas migrations de `supabase/migrations/`; `supabase/schema.sql` permanece como referência para configuração manual. Para usar um projeto hospedado, substitua `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` pela URL e chave pública do projeto. Nunca coloque uma chave `service_role` ou secreta no frontend.

O painel grava produtos somente quando o Supabase confirma a operação. O catálogo de demonstração é usado apenas no modo de desenvolvimento sem Supabase; em produção, uma configuração ausente ou falha de leitura não exibe produtos fictícios. A vitrine consulta somente produtos ativos, enquanto o painel autorizado pode gerenciar produtos ativos e ocultos.

Imagens JPG, PNG e WebP de até 10 MB são enviadas ao bucket público `product-images`; a URL pública fica em `products.image`. Administradores autenticados podem enviar imagens e excluir objetos. A substituição não apaga imagens antigas, e uploads órfãos não são removidos automaticamente. O limite do bucket é 10 MB; confirme também que o limite global de upload do projeto Supabase permite esse tamanho.

O telefone comercial é normalizado e persistido em `store_settings.whatsapp_number`, na linha `id = 'main'`; vitrine, rodapé e mensagem do carrinho usam esse valor. Sem telefone configurado ou catálogo validado, a finalização por WhatsApp fica indisponível em vez de usar um número de exemplo. O carrinho atualiza preço, nome, imagem e estoque do catálogo e bloqueia itens indisponíveis ou acima do estoque atual.

O acesso ao painel é baseado em `admin_user_permissions`, com um único papel `admin`; a Edge Function `admin-users` lista e revoga acessos, mas não concede novos. A chave privilegiada permanece exclusivamente no servidor, e o banco impede revogar o último administrador. Migrações e Edge Functions não são aplicadas automaticamente; siga `docs/ADMIN_SETUP.md` para configuração e implantação explícitas.

Categorias administrativas, clientes, pedidos e financeiro continuam sem integração funcional. O checkout abre o WhatsApp, mas não grava pedidos nem confirma pagamentos.

## Observações
- O fluxo de checkout é orientado ao WhatsApp sem cobrança online.
- O projeto já está preparado para sincronizar o catálogo com Supabase, mantendo fallback local sem quebrar a loja.
- A interface foi inspirada na referência visual e na organização do Vistta, sem copiar lógica de negócio.
