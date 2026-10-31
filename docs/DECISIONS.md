# Decisões técnicas

## Decisão 1
O catálogo local é apenas uma demonstração de desenvolvimento sem Supabase. Produção não apresenta produtos fictícios quando o backend não está configurado.

## Decisão 2
A geração do WhatsApp usa o telefone persistido da loja e os itens, quantidades e preços atuais do catálogo. Sem telefone ou estoque validado, o checkout não cria um link de exemplo.

## Decisão 3
A identidade visual foi adaptada ao guia da marca com paleta em rosa apagado e foco em mobile-first.

## Decisão 4
A arquitetura foi estruturada para evoluir para Supabase sem acoplar regras de negócio aos componentes.

## Decisão 5
O painel administrativo usa navegação lateral responsiva inspirada na hierarquia visual do Vistta, mas aponta somente para rotas existentes da MADU. Indicadores e agrupamentos exibidos no dashboard são derivados do catálogo carregado; áreas sem dados integrados, como pedidos e faturamento, não são preenchidas com números de demonstração.

## Decisão 6
Os assets de marca são mantidos em `public/assets/brand`, e referências visuais do storefront em `docs/reference`. O cabeçalho da loja usa a logo transparente oficial em PNG; favicon e demais formatos de logo ficam organizados junto dela.

## Decisão 7
A navegação da área administrativa é separada da navegação do cliente. Somente administradores ativos acessam o painel completo; a proteção real é feita por Auth e RLS, não apenas por interface ou rota.

## Decisão 8
O cadastro de produtos valida os dados e grava com `insert`/`update` em `products`. Imagens JPG/PNG/WebP até 10 MB vão para `product-images`; a URL pública é persistida em `image`. Cada upload usa caminho único e não remove a imagem anterior automaticamente.

## Decisão 9
O acesso usa Supabase Auth e a tabela `admin_user_permissions` como fonte de autorização atual, refletida também em `app_metadata` para compatibilidade. RLS e a Edge Function consultam a permissão persistida; a chave de serviço fica exclusivamente no servidor. A alteração de perfil usa lock transacional para manter ao menos um administrador.

## Decisão 10
O repositório inclui o Supabase CLI como dependência de desenvolvimento com versão fixa e mantém `supabase/config.toml` versionado para configuração local. Inicializar o CLI não vincula nem altera um projeto hospedado; migrations e `schema.sql` existentes são preservados.

## Decisão 11
O setup local aplica primeiro o schema completo e depois a migration de policies de produtos. A ordem permite criar o banco do zero, mantém o `schema.sql` como referência e alinha os redirecionamentos do Supabase Auth ao servidor Vite em `localhost:5173`.

## Decisão 12
O bucket público `product-images` permite leitura pública dos produtos; upload, atualização e exclusão são restritos a administradores ativos. O bucket e o app limitam imagens a 10 MB. A configuração global do projeto ainda deve permitir o tamanho escolhido.

## Decisão 13
A migration de permissões também cria `store_settings`, persiste o WhatsApp e controla `products.is_active`. A vitrine lê apenas produtos ativos; o carrinho reconsulta os dados atuais antes de habilitar o WhatsApp. Pedidos e pagamentos não são simulados nem gravados.

## Decisão 14
A Edge Function de usuários fixa a versão do `supabase-js` e reutiliza os cabeçalhos CORS oficiais do SDK, mantendo a lista de origins configurada no servidor. A conta administrativa inicial, quando necessária, é promovida exclusivamente pelo SQL Editor confiável.

## Decisão 15
A autorização administrativa identifica a conta pela chave Auth `user_id` e exige `is_active = true`, `status = 'active'` e função `admin`; o e-mail do perfil é informativo e não pode invalidar uma permissão vinculada ao mesmo usuário. Falhas da consulta, perfil ausente e falta de autorização são apresentados como situações distintas. A sessão é renovada após alterações do próprio perfil.

## Decisão 16
A migration não concede privilégios com base em endereços de e-mail. A migration `20261030112352_backfill_trusted_auth_admin_permissions.sql` sincroniza para `admin_user_permissions` somente contas que já têm `raw_app_meta_data.role = 'admin'` e ainda não têm perfil; conflitos preservam a permissão existente, inclusive desativações. Ela também encerra os gatilhos de concessão por e-mails fixos, sem apagar ou rebaixar permissões já gravadas. Novos papéis são concedidos pelo painel autenticado ou por um procedimento administrativo confiável. A autorização de runtime e RLS usam o perfil persistido e o `user_id` Auth; `user_metadata` nunca concede privilégios.

## Decisão 21
O login valida e-mail/senha exclusivamente pelo Supabase Auth e só depois consulta o perfil persistido. `VITE_SUPABASE_URL` e as chaves públicas `VITE_SUPABASE_ANON_KEY`/`VITE_SUPABASE_PUBLISHABLE_KEY` têm prioridade; `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` permanecem como compatibilidade legada. Erros de autenticação, confirmação, sessão, conectividade, configuração e autorização são apresentados separadamente. O Supabase não diferencia e-mail inexistente de senha incorreta na resposta pública de credenciais inválidas, portanto a interface não expõe essa informação.

## Decisão 17
As configurações da loja usam a linha `id = 'main'` e colunas próprias (`store_name`, `whatsapp_number`, `instagram_url`, `updated_at`), não pares genéricos `key/value`. O WhatsApp é lido e gravado nessa linha; a gravação só confirma sucesso após o Supabase retornar o telefone persistido. Policies RLS permitem leitura pública da configuração principal e escrita somente a administradores ativos.

## Decisão 18
O Firebase Hosting publica o build estático do Vite em `dist` e reescreve rotas SPA para `index.html`. O projeto padrão `maduacessorios-b8d44` é definido em `.firebaserc`, podendo ser substituído por deploy. O Firebase não é usado para autenticação ou dados; Supabase continua responsável por essas integrações. Variáveis `VITE_*` precisam estar disponíveis durante o build.

## Decisão 19
A experiência instalável usa manifest e ícones MADU, registro de service worker somente em produção e navegação inferior na loja em telas móveis. O service worker mantém a página offline e assets estáticos versionados; não intercepta nem armazena respostas de API, autenticação, tokens ou imagens remotas. Atualizações são oferecidas sem recarga automática, e a interface informa indisponibilidade da rede sem simular operações offline.

## Decisão 20
A gestão de acessos permite a administradores autenticados listar e revogar perfis existentes; a interface e a Edge Function não concedem acessos nem convidam contas. A autorização é validada na Edge Function e no banco; novas contas Auth não recebem acesso automaticamente. O painel adapta listas a cards no celular, mantém tabelas roláveis em telas maiores e respeita áreas seguras e alvos de toque em Android/iOS.

## Decisão 22
A autorização do painel usa somente o papel `admin`. A migration `20261030115848_make_existing_panel_users_admin_only.sql` converte os perfis de painel que já existiam como `operator` para `admin`, sem reativar perfis inativos; contas Auth sem perfil de painel não são promovidas. A aplicação permite consultar e revogar acessos, mas não concedê-los. Novas concessões exigem um procedimento administrativo confiável no servidor/banco, nunca `user_metadata` nem autoatribuição pelo usuário.

## Decisão 23
Firebase Hosting é a única plataforma de hospedagem da aplicação. O `firebase.json` e o projeto padrão existente em `.firebaserc` são a fonte de configuração; o build Vite é publicado em `dist` com rewrite SPA para `index.html`. Configurações de deploy de outras plataformas não fazem parte do projeto. Firebase hospeda os arquivos estáticos, enquanto Supabase continua responsável por dados, autenticação e imagens.

## Decisão 24
No Supabase local, contas autenticadas podem acessar o painel sem perfil administrativo, inclusive em testes isolados. A exceção exige token com issuer local (`localhost`/`127.0.0.1:54321`); frontend, helpers RLS e Edge Function usam o mesmo limite. Não são criados nem alterados registros em `admin_user_permissions`, e a revogação fica indisponível nesse modo. Tokens de projetos hospedados continuam exigindo o perfil administrativo ativo, sem mudanças nas políticas de produção.
