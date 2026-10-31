# Instruções permanentes do GitHub Copilot

- Priorizar a experiência mobile-first.
- Manter a identidade visual em tons de rosa e lilás.
- Não simular sucesso de upload, venda ou pagamento.
- Preservar a estrutura modular do projeto.
- Documentar mudanças significativas em `docs/DECISIONS.md`.
- Garantir que o carrinho e a mensagem do WhatsApp reflitam dados reais do usuário.
- Criar pedidos no Supabase somente pelo clique explícito de “Finalizar pedido pelo WhatsApp”.
- Confirmar vendas e registrar vendas rápidas exclusivamente por RPC administrativa; nunca alterar `products.stock` diretamente pelo frontend.
- Nunca publicar sem credenciais públicas válidas do Supabase. `npm run build` deve bloquear builds que não tenham `VITE_SUPABASE_URL` e uma chave pública.
