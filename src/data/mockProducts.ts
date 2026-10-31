export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  sale_price_cents?: number;
  sku?: string;
  image: string;
  featured?: boolean;
  is_active?: boolean;
  stock: number;
  variations?: string[];
  material?: string;
  measurements?: string;
  characteristics?: string;
  care?: string;
  warranty?: string;
};

export type ProductCategoryDefinition = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  is_active: boolean;
  position: number;
};

export const defaultCategories: ProductCategoryDefinition[] = [
  { id: 'cat-brincos', name: 'Brincos', slug: 'brincos', description: 'Semijoias delicadas e elegantes.', image_url: '', is_active: true, position: 1 },
  { id: 'cat-colares', name: 'Colares', slug: 'colares', description: 'Peças para compor o visual do dia a dia.', image_url: '', is_active: true, position: 2 },
  { id: 'cat-aneis', name: 'Anéis', slug: 'aneis', description: 'Acessórios em formatos clássicos e modernos.', image_url: '', is_active: true, position: 3 },
  { id: 'cat-pulseiras', name: 'Pulseiras', slug: 'pulseiras', description: 'Modelos leves para uso diário e ocasiões especiais.', image_url: '', is_active: true, position: 4 },
  { id: 'cat-conjuntos', name: 'Conjuntos', slug: 'conjuntos', description: 'Combinações prontas com identidade visual.', image_url: '', is_active: true, position: 5 },
  { id: 'cat-tornozeleiras', name: 'Tornozeleiras', slug: 'tornozeleiras', description: 'Acessórios femininos com acabamento refinado.', image_url: '', is_active: true, position: 6 },
  { id: 'cat-sandalias', name: 'Sandálias', slug: 'sandalias', description: 'Calçados femininos com conforto e estilo.', image_url: '', is_active: true, position: 7 },
  { id: 'cat-bolsas', name: 'Bolsas', slug: 'bolsas', description: 'Acessórios para compor looks e uso cotidiano.', image_url: '', is_active: true, position: 8 },
  { id: 'cat-roupas', name: 'Roupas', slug: 'roupas', description: 'Peças de moda para diferentes ocasiões.', image_url: '', is_active: true, position: 9 },
  { id: 'cat-outros', name: 'Outros', slug: 'outros', description: 'Categorias personalizadas da MADU.', image_url: '', is_active: true, position: 10 },
];

export const categories = defaultCategories.map((category) => category.name);

export const products: Product[] = [
  {
    id: 'p1',
    slug: 'brinco-argola-dourado',
    name: 'Brinco Árgola Dourado',
    description: 'Brinco em dourado com acabamento delicado para uso diário ou em ocasiões especiais.',
    category: 'Brincos',
    price_cents: 9900,
    sale_price_cents: 8900,
    sku: 'BRI-001',
    image: 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=900&q=80',
    featured: true,
    is_active: true,
    stock: 12,
    variations: ['Dourado', 'Prata', 'Rosa'],
  },
  {
    id: 'p2',
    slug: 'colar-porta-luz',
    name: 'Colar Porta de Luz',
    description: 'Peça sofisticada com brilho discreto e modelagem elegante para compor o visual.',
    category: 'Colares',
    price_cents: 12900,
    sku: 'COL-014',
    image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=80',
    featured: true,
    is_active: true,
    stock: 8,
    variations: ['Longo', 'Curto'],
  },
  {
    id: 'p3',
    slug: 'anel-rose-gold',
    name: 'Anel Rose Gold',
    description: 'Anel com toque feminino e acabamento premium em tom rosado sofisticado.',
    category: 'Anéis',
    price_cents: 7900,
    sku: 'ANE-003',
    image: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=900&q=80',
    featured: false,
    is_active: true,
    stock: 14,
    variations: ['Tamanho 16', 'Tamanho 17', 'Tamanho 18'],
  },
  {
    id: 'p4',
    slug: 'pulseira-estrela',
    name: 'Pulseira Estrela',
    description: 'Pulseira leve, delicada e moderna com acabamento que valoriza o look do dia a dia.',
    category: 'Pulseiras',
    price_cents: 6500,
    sale_price_cents: 5900,
    sku: 'PUL-009',
    image: 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=80',
    featured: true,
    is_active: true,
    stock: 9,
    variations: ['Média', 'Grande'],
  },
  {
    id: 'p5',
    slug: 'conjunto-madu',
    name: 'Conjunto Madu',
    description: 'Conjunto com peças coordenadas para um visual elegante e equilibrado.',
    category: 'Conjuntos',
    price_cents: 18900,
    sku: 'CON-021',
    image: 'https://images.unsplash.com/photo-1601821765780-3bf2d00d7f4b?auto=format&fit=crop&w=900&q=80',
    featured: true,
    is_active: true,
    stock: 5,
    variations: ['Conjunto rose', 'Conjunto dourado'],
  },
  {
    id: 'p6',
    slug: 'tornozeleira-prata',
    name: 'Tornozeleira Prata',
    description: 'Tornozeleira com detalhe refinado e ajuste confortável para uso diário.',
    category: 'Tornozeleiras',
    price_cents: 7100,
    sku: 'TOR-008',
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
    featured: false,
    is_active: true,
    stock: 11,
    variations: ['Pequena', 'Média'],
  },
];
