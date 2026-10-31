# Banco de dados e modelo

## Estrutura

O schema e as migrations criam as estruturas abaixo sem apagar dados existentes:

- `products` — catálogo, incluindo preço, estoque, URL pública da imagem e `is_active`.
- `categories` — categorias iniciais; o app ainda usa a lista local para filtros e formulário.
- `customers` — perfil opcional associado a uma conta Auth.
- `orders` e `order_items` — estruturas futuras; o checkout atual envia o cliente ao WhatsApp e não grava pedidos.
- `inventory_movements` — estrutura futura; o app lê somente o saldo atual em `products.stock`.
- `store_settings` — configurações persistidas na linha `id = 'main'`; o WhatsApp fica em `whatsapp_number`, junto de `store_name` e `instagram_url`.
- `admin_user_permissions` — perfil `admin` vinculado ao `user_id` Auth; o e-mail é informativo. Acesso exige `is_active = true` e `status = 'active'`.

Imagens são enviadas ao bucket público `product-images`. `products.image` armazena a URL pública, não base64. O limite do app e do bucket é 10 MB por arquivo, além do limite global do projeto.

## Autorização e RLS

RLS fica habilitado nas tabelas do schema exposto. Produtos ativos e o telefone comercial são públicos. Administradores ativos podem gerenciar produtos, configurações e usuários, além de excluir objetos do Storage. Cada usuário autenticado só pode ler a própria linha de `admin_user_permissions`.

As policies consultam helpers de autorização em um schema `private` não exposto à Data API. A revogação passa por uma função pública `SECURITY INVOKER` acessível apenas a `service_role`, que delega a um helper privado `SECURITY DEFINER` e valida novamente o administrador solicitante. A função serializa mudanças e bloqueia a revogação do último administrador.

A Edge Function `admin-users` verifica o JWT com Auth e consulta o perfil persistido por `user_id`, papel e estado ativo antes de listar ou revogar acessos. A chave de serviço nunca é enviada ao navegador. A migration `20261029234551_admin_permissions_activation_and_email.sql` adiciona e preenche os campos de estado, e atualiza os helpers RLS para ignorar permissões inativas. A migration `20261030112352_backfill_trusted_auth_admin_permissions.sql` sincroniza admins previamente confiáveis em `raw_app_meta_data` somente quando não há perfil, preserva registros existentes e remove a concessão automática baseada em endereços fixos. A migration `20261030115848_make_existing_panel_users_admin_only.sql` converte perfis de painel existentes para `admin`, preserva estados ativos/inativos e remove o papel legado `operator`; contas Auth sem perfil de painel não são promovidas. `user_metadata` não é fonte de autorização.

## Execução segura

O script [schema.sql](../supabase/schema.sql) é uma referência aditiva; ele não migra automaticamente tabelas com formatos diferentes. Faça backup, confira o esquema atual, resolva SKUs duplicados antes do índice único e revise `pg_policies`. Policies permissivas são combinadas por `OR`; uma policy legada pode manter acesso. Não desative RLS.

O projeto atualiza o WhatsApp e o catálogo ativo, mas não integra persistência de categorias, clientes, pedidos, pagamentos ou movimentos de estoque. Uma tabela vazia não é um dado de negócio real. Consulte [ADMIN_SETUP.md](./ADMIN_SETUP.md) antes de aplicar migrations ou publicar Edge Functions.
