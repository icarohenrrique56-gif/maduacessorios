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
O cadastro de produtos valida os dados e grava com `insert`/`update` em `products`. Imagens JPG/PNG/WebP até 5 MB vão para `product-images`; a URL pública é persistida em `image`. Cada upload usa caminho único e não remove a imagem anterior automaticamente.

## Decisão 9
O acesso usa Supabase Auth e a tabela `admin_user_permissions` como fonte de autorização atual, refletida também em `app_metadata` para compatibilidade. RLS e a Edge Function consultam a permissão persistida; a chave de serviço fica exclusivamente no servidor. A alteração de perfil usa lock transacional para manter ao menos um administrador.

## Decisão 10
O repositório inclui o Supabase CLI como dependência de desenvolvimento com versão fixa e mantém `supabase/config.toml` versionado para configuração local. Inicializar o CLI não vincula nem altera um projeto hospedado; migrations e `schema.sql` existentes são preservados.

## Decisão 11
O setup local aplica primeiro o schema completo e depois a migration de policies de produtos. A ordem permite criar o banco do zero, mantém o `schema.sql` como referência e alinha os redirecionamentos do Supabase Auth ao servidor Vite em `localhost:5173`.

## Decisão 12
O bucket público `product-images` permite leitura pública dos produtos; upload, atualização e exclusão são restritos a administradores ativos. O bucket e o app limitam imagens a 5 MB. A configuração global do projeto ainda deve permitir o tamanho escolhido.

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

## Decisão 25
O carrinho só grava um pedido ao confirmar explicitamente a finalização pelo WhatsApp. Pedidos iniciados pelo WhatsApp começam como `pending`, não reservam nem baixam estoque e podem ser confirmados ou cancelados pelo administrador. A confirmação agrega linhas pelo ID do produto, baixa a soma das variações uma única vez e registra uma movimentação. O estorno exige motivo, agrega novamente as linhas e devolve cada unidade uma única vez.

## Decisão 26
Vendas rápidas são feitas pela RPC administrativa `quick_sale_stock_movement`, com quantidade, variação opcional e chave idempotente. A RPC valida autorização, trava o produto, verifica o saldo, atualiza `products.stock` e registra `stock_movements` em uma única transação. O frontend não faz update direto do estoque. O mesmo produto continua sendo atualizado em massa pelas variações, pois o saldo não é separado por variação.

## Decisão 27
A modernização visual da vitrine reutiliza componentes, rotas, serviços e identidades existentes do Vite/React. Categorias, disponibilidade, promoções e filtros usam dados reais do Supabase ou do catálogo carregado; não há campanhas, vendas, descontos ou categorias fictícias em produção. Pesquisa, preço, categoria, variação, disponibilidade, ordenação e produtos relacionados são combinações locais sobre o catálogo já carregado, sem consultas adicionais desnecessárias.

## Decisão 28
A vitrine pública informa estado de catálogo vazio sem simular estoque ou vendas, mantém WhatsApp configurado visível em ações reais e separa claramente confirmação comercial, pagamento e entrega. `robots.txt` e `sitemap.xml` são arquivos estáticos; regras específicas do Firebase precedem o rewrite SPA para evitar que retornem HTML.

## Decisão 29
A tela inicial premium usa diretamente o PNG original do proprietário já existente em `public/assets/brand/madu-logo-transparent.png`; nenhum texto ou marca é redesenhado por SVG ou CSS como substituto da logo. O splash acompanha apenas estados reais de inicialização de autenticação e configurações da loja, usa safe areas e respeita movimento reduzido. Ele não altera rotas, carrinho, estoque, pedidos ou regras comerciais.

## Decisão 30
O ícone móvel instalável usa o arquivo fornecido pelo proprietário dentro de um quadro quadrado para os formatos 192/512 do PWA e máscara Android. Na tela inicial, o mesmo ícone recebe apenas brilho e movimento CSS, sem substituir o conteúdo da marca. O manifesto não usa assets SVG fictícios para ícones do aplicativo.

## Decisão 31
O módulo Financeiro usa `orders`, `order_items`, seus timestamps históricos e os campos reais de status/pagamento já existentes no Supabase. Valores vendidos são pedidos comercialmente válidos e confirmados; recebido exige `payment_status = 'paid'`; pendente usa `payment_status = 'pending'` em pedido válido; cancelamento e estorno são separados. Forma de pagamento e pagamento parcialmente recebido não são inventados porque não existem nas tabelas atuais. O histórico é consultado por período e com limite explícito, respeitando RLS e permissões administrativas.

## Decisão 32
O acesso ao WhatsApp flutuante fica restrito às rotas da vitrine. Rotas `/admin` não renderizam esse botão nem competem com navegação, cabeçalhos e ações administrativas. No menu lateral, a logo ocupa um único bloco visual e não repete o nome MADU em texto, evitando conflito entre marca, ícone e rótulo do painel.

## Decisão 33
Os favicons e ícones instaláveis são derivados da logo oficial MADU sobre fundo rosa blush, com formatos 16, 32, ICO, 180, 192 e 512 pixels. As referências recebem versão explícita, o service worker troca para a revisão v5 e o Firebase mantém os assets de marca em revalidação, evitando que versões antigas do favicon permaneçam em cache.

## Decisão 34
A splash screen usa diretamente o PNG original da MADU em proporção preservada, sem cartão ou título duplicado. O indicador de carregamento é indeterminado e acompanha o estado real de inicialização, sem atraso artificial. Os controles públicos flutuantes são renderizados no mesmo bloco da vitrine pública e ficam fora da árvore de componentes de todas as rotas `/admin`, eliminando sobreposição estrutural.

## Decisão 35
O acesso administrativo aparece como um botão de engrenagem no cabeçalho da vitrine, em desktop e mobile. Ele mantém área de toque de 44 pixels, ícone reconhecível e navegação por teclado; o rodapé não repete o mesmo acesso, evitando atalhos administrativos duplicados.

## Decisão 36
O valor financeiro de pedidos usa `total_cents` como fonte principal e `subtotal_cents` como fallback para registros antigos que ficaram com o total zerado. Confirmar uma venda pelo RPC atualiza simultaneamente estoque, status do pedido e status financeiro para pago; cancelar marca pagamento cancelado e devolver marca reembolso. As vendas no financeiro são derivadas desses estados reais, sem valores simulados.

## Decisão 37
A venda rápida administrativa expõe exclusivamente o RPC `quick_sale_stock_movement(text, text, integer, text)` pelo Supabase Data API, com os argumentos nomeados usados pelo frontend (`p_product_id`, `p_variation`, `p_quantity` e `p_idempotency_key`). A função mantém autorização administrativa, trava por chave idempotente, valida estoque, grava a movimentação de venda e atualiza o produto na mesma transação. A migration de correção recria a função e envia a notificação `pgrst` para atualizar o schema cache do PostgREST.

## Decisão 38
Migrations Supabase pendentes são aplicadas automaticamente ao projeto remoto vinculado, sem solicitar nova confirmação, quando a alteração já foi criada e validada localmente. O fluxo obrigatório cria um backup remoto antes da aplicação, executa `db push --dry-run`, aplica as migrations pendentes, confirma o histórico com `migration list --linked` e valida o projeto com testes e build. Dados existentes não são apagados nem substituídos por essa rotina.

## Decisão 39
O dashboard administrativo é alimentado pelo mesmo banco real usado pelos módulos de pedidos, financeiro e estoque. Ele não contém números simulados: vendas e recebimentos vêm de pedidos válidos; pendências vêm de pagamentos pendentes; estoque baixo vem do catálogo real; vendas rápidas vêm das movimentações sem pedido. Dashboard, financeiro e pedidos compartilham os mesmos estados comerciais e filtros temporais.

## Decisão 40
O número comercial do WhatsApp é uma configuração da loja armazenada em `public.store_settings.whatsapp_number`, editável em Administração → Configurações. Não existe número comercial fixo no código; links de WhatsApp só aparecem após a configuração. A Edge Function administrativa aceita o origin de produção do Firebase e retorna somente conteúdo para usuários autenticados com perfil administrativo ativo.

## Decisão 41
Pedidos criados pelo WhatsApp usam o subtotal e o total calculados a partir das linhas persistidas. O painel administrativo compara os campos do cabeçalho com a soma das linhas e bloqueia confirmação, baixa de estoque e movimentação financeira enquanto houver divergência; nenhuma inconsistência é corrigida silenciosamente pela interface.

## Decisão 42
Testes E2E de pedidos são executados exclusivamente contra Supabase local. Antes de qualquer escrita, o comando confirma a API e o banco em `127.0.0.1`, `localhost` ou `::1`; dados sintéticos são descartados pelo reset local. Migrations remotas e deploy não são executados sem instrução explícita para produção.

## Decisão 43
O cadastro e a edição de produtos usam RLS por perfil administrativo persistido. Estoque cadastrado e movimentações são alterados exclusivamente pela RPC administrativa `set_product_stock`; os controles `−1` e `+1` não escrevem diretamente na tabela de produtos. Imagens usam o bucket público `product-images` com limite de 5 MB, alinhado entre aplicação, bucket e validação de formulário.
