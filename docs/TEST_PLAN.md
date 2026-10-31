# Plano de testes

## Fluxos principais
- Cadastro e edição de produtos.
- Alteração de preços e promoção.
- Carrinho com quantidades e subtotal.
- Geração da mensagem de WhatsApp.
- Navegação mobile e desktop.
- Fallback para mensagens alternativas.
- O carrinho não cria pedido ao abrir ou alterar itens; somente o clique de finalização chama a RPC.
- Pedidos pendentes não alteram `products.stock`.
- Confirmação e estorno somam linhas do mesmo produto por ID, independentemente das variações.
- Estorno exige motivo e não repete a devolução.
- Venda rápida valida saldo, reduz estoque e registra movimento atomicamente.
- Repetir a chave idempotente da venda rápida não reduz estoque duas vezes.

## Critérios de aceitação
- O carrinho persiste no navegador.
- A mensagem de WhatsApp inclui produto, quantidade e total.
- A loja permanece utilizável em telas pequenas.
- O painel admin é simples e funcional.
