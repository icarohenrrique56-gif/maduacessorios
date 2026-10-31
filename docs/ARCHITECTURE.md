# Arquitetura

## Visão geral
A aplicação foi organizada em camadas para separar apresentação, regras de negócio e persistência local.

## Camadas
- `src/App.tsx`: rotas e telas atuais do storefront e do painel administrativo.
- `src/components`: componentes reutilizáveis; `Navigation/MaduSidebar.tsx` contém a navegação do painel.
- `src/context`: estado do carrinho persistente no navegador.
- `src/data`: catálogo local e categorias.
- `src/lib`: helpers de comércio, integração Supabase e testes de regras.
- `src/test`: configuração compartilhada dos testes.
- `public/assets/brand`: logos e favicons servidos como assets estáticos.
- `docs/reference`: referências visuais do projeto.

## Regras de desenvolvimento
- Lógica de negócio fora de componentes de apresentação.
- Persistência local no navegador apenas para a experiência do cliente.
- Dados administrativos preparados para evolução com Supabase.
- Mobile-first como prioridade de layout e lógica.
