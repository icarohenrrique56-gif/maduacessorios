# Configuração do Supabase e do painel MADU

## Auditoria somente de leitura do projeto configurado

Na auditoria de 29/10/2026, `public.products` e o bucket público `product-images` existiam. A tabela `public.store_settings` e a tabela `public.admin_user_permissions` ainda não existiam. O bucket aceitava JPG/PNG/WebP e limitava cada arquivo a 5 MB. As policies atuais de produtos e Storage confiavam em `app_metadata.role` e devem ser substituídas pela migration antes de usar os novos fluxos. Nenhum dado foi alterado pela auditoria.

## Aplicação explícita das migrations

### Acesso administrativo no desenvolvimento local

No Supabase local, qualquer usuário autenticado recebe acesso ao painel para facilitar desenvolvimento e testes. A exceção usa exclusivamente o issuer local `http://127.0.0.1:54321/auth/v1` ou `http://localhost:54321/auth/v1`; ela não cria perfis, não altera `admin_user_permissions` e não se aplica a tokens emitidos por projetos hospedados. A migration correspondente também limita essa exceção aos helpers RLS, e a Edge Function aplica o mesmo limite. Em projetos hospedados, somente administradores ativos já registrados continuam autorizados.

O painel local lista as contas Auth locais, mas não permite revogar o acesso universal de desenvolvimento. Para validar autorização administrativa de produção, use um ambiente hospedado de staging e um perfil de administrador ativo.

O teste de banco verifica os dois lados desse limite sem alterar permissões persistidas:

```bash
npx supabase test db --local
```

1. Confirme o Project ref e faça backup do projeto antes de qualquer alteração.
2. No terminal, vincule o CLI ao projeto correto:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   ```

3. Revise os arquivos em `supabase/migrations/` e, quando estiver pronto, aplique-os explicitamente:

   ```bash
   npx supabase db push
   ```

   As migrations criam `store_settings` e `admin_user_permissions`, preservam as contas que já têm a claim administrativa, sincronizam o e-mail Auth em minúsculas, definem `is_active`/`status` para permissões existentes, atualizam as policies, aplicam `products.is_active` e elevam o limite do bucket para 10 MB. A migration `20261030112352_backfill_trusted_auth_admin_permissions.sql` traz para a tabela os usuários com `raw_app_meta_data.role = 'admin'` que ainda não têm perfil, sem sobrescrever permissões existentes, e remove os gatilhos de concessão por endereços fixos. Ela não apaga permissões existentes. Aplique-a no projeto certo para que admins já reconhecidos pelo Supabase Auth tenham o perfil necessário às policies RLS.

4. Em staging, revise as policies resultantes e execute `npx supabase db advisors --linked --type security` antes de liberar o painel.
5. Verifique no painel Supabase que o limite global de upload do projeto permite pelo menos 10 MB. O limite do bucket, isoladamente, não supera um limite global menor.
6. Habilite o provedor de e-mail e mantenha o cadastro público desabilitado se a loja não aceitar registros abertos. Nenhum endereço recebe privilégios automaticamente; novos papéis são atribuídos por um administrador autenticado ou pelo procedimento administrativo confiável descrito abaixo.

Para conceder acesso a outros usuários, use **Painel → Usuários e permissões** após autenticar como administrador. Para um bootstrap excepcional, use o SQL Editor confiável do Supabase e substitua pelo e-mail verificado:

```sql
do $$
declare
  target_user_id uuid;
begin
  select id into target_user_id
  from auth.users
  where email = 'admin@seudominio.com';

  if target_user_id is null then
    raise exception 'Conta Auth não encontrada';
  end if;

  insert into public.admin_user_permissions (user_id, email, role, is_active, status)
  select id, lower(email), 'admin', true, 'active'
  from auth.users
  where id = target_user_id
  on conflict (user_id) do update
    set email = excluded.email,
        role = 'admin',
        is_active = true,
        status = 'active',
        updated_at = now();

  update auth.users
  set raw_app_meta_data =
    (coalesce(raw_app_meta_data, '{}'::jsonb) - 'role')
    || jsonb_build_object('role', 'admin')
  where id = target_user_id;
end
$$;
```

O SQL Editor é uma superfície administrativa confiável; não exponha essas instruções ou credenciais de serviço no cliente. Encerre e renove a sessão para que Auth reflita a claim atualizada. A tela **Usuários e permissões** permite consultar e revogar acessos, mas não concedê-los. Novos administradores devem ser adicionados somente por procedimento administrativo confiável no servidor/banco. A migration `20261030115848_make_existing_panel_users_admin_only.sql` promove os perfis de painel existentes, mantendo estados inativos, sem alterar contas Auth sem perfil. O banco bloqueia a revogação concorrente do último administrador; sessões abertas podem precisar de atualização para refletir a mudança na interface.

Se a API informar que `public.store_settings` ou alguma coluna não existe no cache, confirme no SQL Editor que a tabela usa `id`, `store_name`, `whatsapp_number`, `instagram_url` e `updated_at`, com o registro principal `id = 'main'`. A migration de settings usa esse formato, aplica policies de leitura pública e escrita somente por administradores ativos e envia `NOTIFY pgrst, 'reload schema'`. Publique também a versão atualizada do frontend para substituir versões antigas que consultavam o formato anterior de configurações.

## Edge Function de usuários

A gestão de usuários usa `supabase/functions/admin-users/index.ts`. A função valida a sessão Auth, confirma o perfil atual na tabela e usa a Admin Auth API exclusivamente no servidor. Nunca configure `service_role` ou chaves secretas com prefixo `VITE_`.

Depois de aplicar a migration, configure o origin exato da aplicação e implante a função somente quando estiver pronto:

```bash
npx supabase secrets set ADMIN_APP_ORIGINS="https://sua-loja.example"
npx supabase functions deploy admin-users
```

Para desenvolvimento local, permita também `http://localhost:5173`. Origins são separados por vírgula e não incluem caminho. Em produção, configure o domínio real; a função não aceita origins arbitrários.

**Painel → Usuários e permissões** lista administradores ativos e permite revogar o acesso após confirmação. A Edge Function não oferece convite ou concessão de acesso. Somente uma sessão de administrador pode chamar a função, e o banco impede revogar o último administrador.

Para a gestão funcionar na publicação estática, configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `VITE_SUPABASE_ANON_KEY`) no ambiente de build do Firebase Hosting e publique novamente o frontend. `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL`/`SUPABASE_ANON_KEY` da Edge Function permanecem exclusivamente nos secrets/ambiente do Supabase. Configurar somente o Firebase Hosting não configura a autenticação nem a função.

## WhatsApp comercial

Em **Administração → Configurações**, informe o número comercial com código do país e salve. O número fica em `public.store_settings.whatsapp_number` na linha `id = 'main'`; vitrine, rodapé e carrinho leem essa mesma configuração. O `VITE_WHATSAPP_NUMBER` é apenas um fallback opcional se a linha ainda não existir. Não há número fictício padrão; sem valor confirmado, os links de contato/checkout não são gerados.

## Produtos e Storage

- A vitrine consulta somente produtos com `is_active = true`; administradores autenticados podem consultar todos e gerenciar o catálogo.
- Administradores ativos podem enviar, atualizar e excluir imagens. O app não apaga arquivos na substituição.
- O bucket público `product-images` permite que qualquer visitante baixe uma imagem ao conhecer sua URL. Listagem e exclusão continuam protegidas.
- O formulário aceita JPG, PNG e WebP até 10 MB. A imagem é enviada pelo único cliente Supabase do app e sua URL pública só é persistida no produto depois da confirmação do banco.
- Um upload concluído antes de uma falha ao salvar o produto pode deixar um objeto órfão. Ele não é removido automaticamente; revise o uso do arquivo antes de qualquer limpeza manual.

## RLS e limites funcionais

A autorização usa `admin_user_permissions` vinculada ao `user_id` Auth, não e-mail e nem `user_metadata`. `raw_app_meta_data.role = 'admin'` é usado somente pela migration de backfill para não perder admins já confiáveis; perfis existentes prevalecem e são avaliados por estado ativo. Policies antigas conhecidas de produtos e Storage são removidas/substituídas pela migration. Antes de aplicar manualmente sobre um projeto com policies customizadas, revise `pg_policies`: policies permissivas são combinadas por `OR`; uma policy legada pode continuar concedendo acesso. Não desative RLS.

Se o login autenticar mas mostrar que a conta não tem autorização, execute esta consulta no SQL Editor do projeto correto, substituindo o e-mail pelo usado no login:

```sql
select
  users.id as auth_user_id,
  users.email as auth_email,
  permissions.user_id as permission_user_id,
  permissions.email as permission_email,
  permissions.role,
  permissions.is_active,
  permissions.status
from auth.users as users
left join public.admin_user_permissions as permissions
  on permissions.user_id = users.id
where lower(users.email) = lower('email-usado-no-login@example.com');
```

Confirme que `permission_user_id` corresponde ao `auth_user_id`, que `role` é `admin`, `is_active` é `true` e `status` é `active`; o e-mail salvo no perfil não é usado para autorizar. Se a linha não existir mas `raw_app_meta_data.role` for `admin`, aplique a migration de backfill. Se a linha não existir ou estiver inativa por outro motivo, siga o procedimento de bootstrap confiável acima para uma conta verificada. Após corrigir a permissão no banco, encerre a sessão e entre novamente. Não habilite acesso automaticamente para todas as contas Auth.

Categorias administrativas, clientes, pedidos e financeiro ainda não têm integração funcional no app. O checkout envia um resumo real do carrinho ao WhatsApp, mas não grava um pedido, reserva estoque nem processa/confirmar pagamento.

## Setup local e execução

O fluxo local exige Docker e pode ser iniciado com `npx supabase start`; ele é independente do projeto hospedado. Em ambientes de desenvolvimento sem Supabase, a vitrine pode exibir produtos locais de demonstração. Em produção, a ausência ou falha do backend não apresenta esse catálogo de demonstração.

Migrations e Edge Functions não são aplicadas automaticamente. Revise e autorize separadamente cada operação remota.
