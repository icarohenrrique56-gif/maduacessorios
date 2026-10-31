# Guia administrativo

## Como usar
1. Acesse a rota `/admin`.
2. Revise as métricas e ações rápidas.
3. Adicione ou edite produtos a partir da estrutura de dados central.
4. Atualize preços e categorias no arquivo de dados de referência para testar o fluxo.

## Operações essenciais
- Cadastrar produtos.
- Alterar preço e promoção.
- Configurar categorias.
- Revisar carrinho e WhatsApp.
- Confirmar pedidos do WhatsApp somente após combinar a disponibilidade; a confirmação baixa o estoque.
- Cancelar pedidos pendentes sem movimentar estoque.
- Estornar vendas confirmadas informando um motivo; o saldo é devolvido uma única vez.
- Registrar vendas rápidas na tela de Estoque, escolhendo produto, variação opcional e quantidade.
- Ajustar identidade visual e textos do storefront.

## Segurança
- Nenhuma chave privada deve ser exposta no front-end.
- Painel e operações de estoque exigem sessão administrativa do Supabase com perfil `admin` ativo.
