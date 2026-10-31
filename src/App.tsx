import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Heart, Menu, MessageCircleMore, Minus, Pencil, Plus, Search, Settings, ShoppingBag, Sparkles, Star, Trash2, Truck } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { defaultCategories, type Product } from './data/mockProducts';
import {
  buildOrderWhatsAppMessage,
  buildWhatsAppUrl,
  formatCurrency,
  getCartSummary,
} from './lib/commerce';
import {
  getCategoriesFromSupabase,
  saveCategoryToSupabase,
  deleteCategoryFromSupabase,
  type Category,
} from './lib/categories';
import {
  getProductsFromSupabase,
  getSupabaseStatus,
  deleteProductFromSupabase,
  saveProductToSupabase,
  updateProductInSupabase,
  uploadProductImage,
} from './lib/supabase';
import {
  createProductFromForm,
  emptyProductForm,
  type ProductFormErrors,
  type ProductFormField,
  type ProductFormValues,
  validateProductImageFile,
  validateProductForm,
} from './lib/products';
import { useCart } from './context/CartContext';
import { MaduSidebar } from './components/Navigation/MaduSidebar';
import type { AdminPageId } from './components/Navigation/MaduSidebar';
import { useAdminAuth } from './context/AdminAuthContext';
import { AdminRouteGuard } from './components/Navigation/AdminRouteGuard';
import { ProductImageField } from './components/Admin/ProductImageField';
import maduLogo from './assets/madu-logo-transparent.png';
import { useStoreSettings } from './context/StoreSettingsContext';
import { normalizeWhatsAppNumber, WHATSAPP_COMPATIBLE_EMOJIS } from './lib/storeSettings';
import { OfflineNotice, PurchaseGuide, PwaInstallButton, StoreBottomNavigation, VersionUpdateNotice } from './components/PWA/PwaControls';
import { createWhatsAppOrder } from './lib/orders';
import { trackStorefrontEvent } from './lib/analytics';

type ProductView = Product;

const AdminLoginPage = lazy(() =>
  import('./pages/AdminLoginPage').then((module) => ({ default: module.AdminLoginPage })),
);
const UserManagement = lazy(() =>
  import('./components/Admin/UserManagement').then((module) => ({ default: module.UserManagement })),
);
const OrdersPage = lazy(() =>
  import('./components/Admin/OrdersPage').then((module) => ({ default: module.OrdersPage })),
);
const StockMovements = lazy(() =>
  import('./components/Admin/StockMovements').then((module) => ({ default: module.StockMovements })),
);

function useStorefrontProducts(includeInactive = false) {
  const [catalog, setCatalog] = useState<ProductView[]>(
    () => [],
  );
  const [syncStatus, setSyncStatus] = useState('Carregando catálogo...');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refreshCatalog = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const status = getSupabaseStatus();
      if (!status.enabled) {
        throw new Error(status.message);
      }
      const remoteProducts = await getProductsFromSupabase(includeInactive);
      setCatalog(remoteProducts);
      setSyncStatus(getSupabaseStatus().message);
      setIsLoading(false);
      return remoteProducts;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Erro inesperado ao carregar o catálogo.';
      setSyncStatus(reason);
      setLoadError(true);
      setIsLoading(false);
      return null;
    }
  }, [includeInactive]);

  const addConfirmedProduct = useCallback((product: ProductView) => {
    setCatalog((current) => [product, ...current.filter((item) => item.id !== product.id)]);
  }, []);
  const removeConfirmedProduct = useCallback((productId: string) => {
    setCatalog((current) => current.filter((item) => item.id !== productId));
  }, []);

  useEffect(() => {
    void refreshCatalog();
  }, [refreshCatalog]);

  return {
    catalog,
    syncStatus,
    isLoading,
    loadError,
    refreshCatalog,
    addConfirmedProduct,
    removeConfirmedProduct,
  };
}

function useCatalogCategories() {
  const [categories, setCategories] = useState<string[]>([]);

  const refreshCategories = useCallback(async () => {
    try {
      const remote = await getCategoriesFromSupabase(true);
      const names = remote.map((category) => category.name);
      setCategories(names);
      return remote;
    } catch {
      setCategories([]);
      return [] as Category[];
    }
  }, []);

  useEffect(() => {
    void refreshCategories();
  }, [refreshCategories]);

  return { categories, refreshCategories };
}

function App() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className={`min-h-screen bg-[#f9eff4] text-stone-800 ${isAdminRoute ? '' : 'pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0'}`}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/produtos" element={<CatalogPage />} />
        <Route path="/produto/:slug" element={<ProductPage />} />
        <Route path="/carrinho" element={<CartPage />} />
        <Route path="/admin/login" element={<Suspense fallback={<RouteLoadingFallback />}><AdminLoginPage /></Suspense>} />
        <Route path="/admin" element={<AdminRouteGuard><AdminPage /></AdminRouteGuard>} />
        <Route path="/admin/produtos" element={<AdminRouteGuard><AdminPage /></AdminRouteGuard>} />
        <Route path="/admin/:module" element={<AdminRouteGuard><AdminModulePage /></AdminRouteGuard>} />
        <Route path="/admin/*" element={<AdminRouteGuard><AdminModulePage /></AdminRouteGuard>} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      <StoreBottomNavigation />
      <PurchaseGuide />
      <OfflineNotice />
      <VersionUpdateNotice />
    </div>
  );
}

function RouteLoadingFallback() {
  return (
    <main aria-busy="true" aria-label="Carregando tela" className="flex min-h-[50svh] items-center justify-center px-4">
      <div className="w-full max-w-sm animate-pulse space-y-4 rounded-3xl bg-white p-6">
        <div className="h-6 w-1/2 rounded bg-[#f8e9ef]" />
        <div className="h-4 w-full rounded bg-[#f8e9ef]" />
        <div className="h-11 w-full rounded-full bg-[#f8e9ef]" />
      </div>
    </main>
  );
}

function HomePage() {
  const { catalog, isLoading } = useStorefrontProducts();
  const { categories } = useCatalogCategories();
  const { whatsappNumber, loading: settingsLoading } = useStoreSettings();
  const featured = catalog.filter((product) => product.featured).slice(0, 6);
  const homeProducts = featured.length > 0 ? featured : catalog.slice(0, 6);
  const heroProduct = homeProducts.find((product) => product.image) ?? null;
  const realCategories = categories.length > 0
    ? categories
    : [...new Set(catalog.map((product) => product.category).filter(Boolean))];
  const promotions = catalog.filter((product) =>
    product.is_active !== false &&
    product.sale_price_cents !== undefined &&
    product.sale_price_cents < product.price_cents,
  ).slice(0, 6);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-[#e9abc8] bg-gradient-to-r from-[#f8dde8] via-[#f5e2ef] to-[#f5d7f0] shadow-soft">
          <div className="grid gap-6 p-5 md:grid-cols-[1.1fr_0.9fr] md:p-10">
            <div className="flex flex-col justify-center">
              {heroProduct && (
                <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[#8B5E7C]">
                  <Sparkles size={14} />
                  Novidades da Madu
                </span>
              )}
              <h1 className="max-w-md text-3xl font-semibold leading-tight text-[#2d1d25] sm:text-5xl">
                Peças delicadas para acompanhar seus melhores momentos.
              </h1>
              <p className="mt-4 max-w-xl text-sm text-[#5d4454] sm:text-base">
                Coleções curadas para valorizar o brilho do cotidiano com sofisticação, delicadeza e identidade feminina.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link to="/produtos" className="inline-flex items-center justify-center rounded-full bg-[#8B5E7C] px-5 py-3 text-sm font-medium text-white shadow-md transition hover:opacity-90">
                  Ver coleção
                  <ArrowRight className="ml-2" size={16} />
                </Link>
                {whatsappNumber ? (
                  <a href={buildWhatsAppUrl(whatsappNumber, 'Olá! Vim pelo site da MADU.')} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full border border-[#8B5E7C] bg-white/70 px-5 py-3 text-sm font-medium text-[#8B5E7C]">
                    Falar no WhatsApp
                  </a>
                ) : (
                  <span className="inline-flex items-center justify-center rounded-full border border-[#8B5E7C]/40 bg-white/50 px-5 py-3 text-sm text-[#76506a]">
                    {settingsLoading ? 'Carregando WhatsApp...' : 'WhatsApp indisponível'}
                  </span>
                )}
              </div>
            </div>
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-[2rem] bg-white/15 blur-3xl" />
              {heroProduct ? (
                <Link to={`/produto/${heroProduct.slug}`} aria-label={`Ver ${heroProduct.name}`} className="relative w-full">
                  <img
                    src={heroProduct.image}
                    alt={heroProduct.name}
                    fetchPriority="high"
                    decoding="async"
                    className="relative h-[min(420px,55svh)] min-h-[260px] w-full rounded-[2rem] object-contain bg-white/60 shadow-soft"
                  />
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[#2d1d25]">Categorias</h2>
            <Link to="/produtos" className="text-sm font-medium text-[#8B5E7C]">Ver tudo</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {realCategories.slice(0, 6).map((category) => (
              <Link key={category} to={`/produtos?categoria=${encodeURIComponent(category)}&disponivel=1`} className="rounded-2xl border border-[#e9abc8] bg-white p-3 text-center shadow-sm transition hover:border-[#8B5E7C] hover:bg-[#fffafc]">
                <p className="text-sm font-medium text-[#3d2b35]">{category}</p>
              </Link>
            ))}
          </div>
        </section>

        {promotions.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8B5E7C]">Preço especial</p>
                <h2 className="mt-1 text-xl font-semibold text-[#2d1d25]">Ofertas da Madu</h2>
              </div>
              <Link to="/produtos?ordenar=desconto" className="text-sm font-medium text-[#8B5E7C]">Ver ofertas</Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-3">
              {promotions.slice(0, 3).map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          </section>
        )}

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[#2d1d25]">Novidades</h2>
            <Link to="/produtos" className="text-sm font-medium text-[#8B5E7C]">Ver catálogo</Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
            {isLoading
              ? Array.from({ length: 3 }, (_, index) => <ProductCardSkeleton key={index} />)
              : homeProducts.length > 0
                ? homeProducts.slice(0, 3).map((product) => <ProductCard key={product.id} product={product} />)
                : null}
          </div>
        </section>

        <section className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4">
          {[
            { icon: <Truck size={20} />, title: 'Entrega', text: 'Atendimento próximo com cuidado na escolha do presente.' },
            { icon: <MessageCircleMore size={20} />, title: 'WhatsApp', text: 'Finalize o pedido de forma simples e direta.' },
            { icon: <Heart size={20} />, title: 'Detalhes', text: 'Peças curadas com beleza, leveza e personalidade.' },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#f1dfe9] bg-white p-4 shadow-sm">
              <div className="mb-2 inline-flex rounded-full bg-[#f8e9ef] p-2.5 text-[#8B5E7C]">{item.icon}</div>
              <h3 className="text-base font-semibold text-[#2d1d25] sm:text-lg">{item.title}</h3>
              <p className="mt-1 text-sm leading-5 text-[#5d4454]">{item.text}</p>
            </div>
          ))}
        </section>
      </main>
      <Footer />
    </>
  );
}

function CatalogPage() {
  const { catalog, isLoading, loadError, syncStatus } = useStorefrontProducts();
  const { categories } = useCatalogCategories();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [category, setCategory] = useState(searchParams.get('categoria') ?? 'Todas');
  const [sort, setSort] = useState(searchParams.get('ordenar') ?? 'news');
  const [availableOnly, setAvailableOnly] = useState(searchParams.get('disponivel') === '1');
  const [variation, setVariation] = useState('Todas');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const realCategories = categories.length > 0
    ? categories
    : [...new Set(catalog.map((product) => product.category).filter(Boolean))];
  const realVariations = useMemo(() =>
    [...new Set(catalog.flatMap((product) => product.variations ?? []).filter(Boolean))],
  [catalog]);

  const filteredProducts = useMemo(() => {
    const byText = catalog.filter((product) => {
      const term = search.toLowerCase();
      return (
        !term ||
        product.name.toLowerCase().includes(term) ||
        product.description.toLowerCase().includes(term) ||
        (product.sku ?? '').toLowerCase().includes(term)
      );
    });

    const byCategory = category === 'Todas' ? byText : byText.filter((product) => product.category === category);
    const byVariation = variation === 'Todas' ? byCategory : byCategory.filter((product) => product.variations?.includes(variation));
    const byAvailability = availableOnly ? byVariation.filter((product) => product.stock > 0) : byVariation;
    const min = minPrice.trim() ? Number(minPrice) * 100 : 0;
    const max = maxPrice.trim() ? Number(maxPrice) * 100 : Number.POSITIVE_INFINITY;
    const byPrice = byAvailability.filter((product) => {
      const price = product.sale_price_cents ?? product.price_cents;
      return Number.isFinite(price) && price >= min && price <= max;
    });

    return [...byPrice].sort((a, b) => {
      if (sort === 'low') return (a.sale_price_cents ?? a.price_cents) - (b.sale_price_cents ?? b.price_cents);
      if (sort === 'high') return (b.sale_price_cents ?? b.price_cents) - (a.sale_price_cents ?? a.price_cents);
      if (sort === 'discount') {
        const discountA = a.sale_price_cents !== undefined ? a.price_cents - a.sale_price_cents : 0;
        const discountB = b.sale_price_cents !== undefined ? b.price_cents - b.sale_price_cents : 0;
        return discountB - discountA;
      }
      return Number(b.featured === true) - Number(a.featured === true);
    });
  }, [catalog, search, category, sort, availableOnly, variation, minPrice, maxPrice]);

  useEffect(() => {
    if (!search.trim()) return;
    const timeout = window.setTimeout(() => {
      void trackStorefrontEvent('catalog_search', { searchTerm: search });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [search]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3 text-[#8B5E7C]" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, descrição ou SKU..."
              className="w-full rounded-full border border-[#efd7e7] bg-[#fffafc] py-3 pl-10 pr-4 text-sm outline-none ring-0 placeholder:text-[#9c7d8d]"
            />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-[minmax(110px,1fr)_minmax(110px,1fr)_minmax(110px,1fr)_auto]">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-w-0 w-full rounded-full border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-sm text-[#3d2b35] outline-none">
              <option value="Todas">Todas</option>
              {realCategories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            {realVariations.length > 0 && (
              <select value={variation} onChange={(event) => setVariation(event.target.value)} className="min-w-0 w-full rounded-full border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-sm text-[#3d2b35] outline-none">
                <option value="Todas">Todas as variações</option>
                {realVariations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            )}
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="min-w-0 w-full rounded-full border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-sm text-[#3d2b35] outline-none">
              <option value="news">Novidades</option>
              <option value="low">Menor preço</option>
              <option value="high">Maior preço</option>
              <option value="discount">Maior desconto</option>
            </select>
            <label className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#efd7e7] bg-[#fffafc] px-3 text-sm text-[#5d4454] sm:col-span-1">
              <input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} className="accent-[#8B5E7C]" />
              Disponíveis
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-[#f4e8ee] pt-3 sm:max-w-md sm:self-end">
            <input type="number" min="0" step="1" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="Preço mín." aria-label="Preço mínimo" className="w-full rounded-full border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-sm text-[#3d2b35]" />
            <input type="number" min="0" step="1" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Preço máx." aria-label="Preço máximo" className="w-full rounded-full border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-sm text-[#3d2b35]" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 6 }, (_, index) => <ProductCardSkeleton key={index} />)
          ) : loadError ? (
            <p role="alert" className="col-span-full rounded-3xl border border-rose-200 bg-white p-8 text-center text-[#5d4454]">
              {syncStatus || 'Não foi possível carregar o catálogo. Verifique sua conexão e tente novamente.'}
            </p>
          ) : filteredProducts.length > 0 ? (
            filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)
          ) : (
            <div className="col-span-full rounded-3xl border border-dashed border-[#d7b0c0] bg-white p-8 text-center text-[#5d4454]">
              <p>Nenhum produto encontrado com esses filtros.</p>
              <button type="button" onClick={() => { setSearch(''); setCategory('Todas'); setAvailableOnly(false); setSort('news'); setVariation('Todas'); setMinPrice(''); setMaxPrice(''); }} className="mt-4 min-h-11 rounded-full bg-[#8B5E7C] px-5 text-sm font-medium text-white">
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function ProductPage() {
  const { catalog, isLoading, loadError } = useStorefrontProducts();
  const { slug } = useParams();
  const product = catalog.find((item) => item.slug === slug);
  const [selectedVariation, setSelectedVariation] = useState('');
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();

  useEffect(() => {
    setSelectedVariation(product?.variations?.[0] ?? '');
    setQuantity(1);
  }, [product?.id]);

  useEffect(() => {
    if (product) void trackStorefrontEvent('product_view', { productId: product.id });
  }, [product?.id]);

  const related = product
    ? catalog
        .filter((item) => item.id !== product.id && item.category === product.category)
        .concat(catalog.filter((item) => item.id !== product.id && item.category !== product.category))
        .slice(0, 3)
    : [];

  if (!product && isLoading) {
    return (
      <>
        <Header />
        <main aria-busy="true" aria-label="Carregando produto" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid animate-pulse gap-8 rounded-[2rem] bg-white p-4 shadow-sm lg:grid-cols-2">
            <div className="aspect-square rounded-[2rem] bg-[#f8e9ef]" />
            <div className="space-y-4 py-8">
              <div className="h-4 w-24 rounded bg-[#f8e9ef]" />
              <div className="h-8 w-3/4 rounded bg-[#f8e9ef]" />
              <div className="h-5 w-1/3 rounded bg-[#f8e9ef]" />
              <div className="h-24 rounded bg-[#f8e9ef]" />
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  if (!product) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-16 text-center text-[#5d4454] sm:px-6 lg:px-8">
          <h1 className="text-2xl font-semibold text-[#2d1d25]">Produto indisponível</h1>
          <p className="mt-3">{loadError ? 'Não foi possível consultar o catálogo. Verifique sua conexão e tente novamente.' : 'Este produto não está no catálogo atual.'}</p>
          <Link to="/produtos" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#8B5E7C] px-5 text-sm font-medium text-white">
            Voltar aos produtos
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 rounded-[2rem] border border-[#e9abc8] bg-white p-4 shadow-soft lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
          <div>
            <img src={product.image} alt={product.name} fetchPriority="high" decoding="async" className="h-[min(500px,75svh)] w-full rounded-[2rem] border border-[#f2b7d1] bg-[#fffafc] object-contain" />
          </div>

          <div className="flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8B5E7C]">{product.category}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${product.stock > 0 ? 'bg-[#edf2e8] text-[#5f7049]' : 'bg-[#f7e8ec] text-[#955a69]'}`}>
                {product.stock > 0 ? `${product.stock} disponíveis` : 'Esgotado'}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-[#2d1d25]">{product.name}</h1>
            <div className="mt-4 flex items-center gap-2 text-[#8B5E7C]">
              <Star size={16} className="fill-current" />
              <span className="text-sm">Produto selecionado</span>
            </div>

            <div className="mt-5 flex items-end gap-3">
              <span className="text-3xl font-semibold text-[#2d1d25]">{formatCurrency(product.sale_price_cents ?? product.price_cents)}</span>
              {product.sale_price_cents !== undefined ? <span className="text-base text-[#9c7d8d] line-through">{formatCurrency(product.price_cents)}</span> : null}
            </div>

            <p className="mt-5 text-sm leading-7 text-[#5d4454]">{product.description}</p>

            {[
              ['Material', product.material],
              ['Medidas', product.measurements],
              ['Características', product.characteristics],
              ['Cuidados', product.care],
              ['Garantia', product.warranty],
            ].some(([, value]) => Boolean(value?.trim())) && (
              <dl className="mt-5 grid gap-2 rounded-2xl border border-[#f1dfe9] bg-[#fffafc] p-4 text-sm">
                {[
                  ['Material', product.material],
                  ['Medidas', product.measurements],
                  ['Características', product.characteristics],
                  ['Cuidados', product.care],
                  ['Garantia', product.warranty],
                ].filter(([, value]) => Boolean(value?.trim())).map(([label, value]) => (
                  <div key={label} className="grid gap-1 sm:grid-cols-[120px_1fr]">
                    <dt className="font-medium text-[#3d2b35]">{label}</dt>
                    <dd className="text-[#5d4454]">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {product.variations && product.variations.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-sm font-medium text-[#3d2b35]">Variação</p>
                <div className="flex flex-wrap gap-2">
                  {product.variations.map((variation) => (
                    <button
                      key={variation}
                      type="button"
                      onClick={() => setSelectedVariation(variation)}
                      className={`rounded-full border px-4 py-2 text-sm ${selectedVariation === variation ? 'border-[#8B5E7C] bg-[#8B5E7C] text-white' : 'border-[#ecdce3] bg-white text-[#3d2b35]'}`}
                    >
                      {variation}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <div className="flex items-center overflow-hidden rounded-full border border-[#efd7e7] bg-[#fffafc]">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="inline-flex min-h-11 min-w-11 items-center justify-center p-3 text-[#8B5E7C]" aria-label="Diminuir quantidade">
                  <Minus size={16} />
                </button>
                <span className="min-w-10 text-center text-sm font-medium text-[#2d1d25]">{quantity}</span>
                <button type="button" disabled={quantity >= product.stock} onClick={() => setQuantity((value) => Math.min(product.stock, value + 1))} className="inline-flex min-h-11 min-w-11 items-center justify-center p-3 text-[#8B5E7C] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Aumentar quantidade">
                  <Plus size={16} />
                </button>
              </div>
              <button
                type="button"
                disabled={product.stock < 1}
                onClick={() => {
                  addToCart({ id: product.id, name: product.name, image: product.image, unitPrice: product.sale_price_cents ?? product.price_cents, variation: selectedVariation, sku: product.sku, availableStock: product.stock, quantity });
                  void trackStorefrontEvent('add_to_cart', { productId: product.id });
                }}
                className="flex-1 rounded-full bg-[#8B5E7C] px-4 py-3 text-sm font-medium text-white shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {product.stock > 0 ? 'Adicionar ao carrinho' : 'Indisponível'}
              </button>
            </div>

            <div className="mt-5 grid gap-2 text-sm text-[#5d4454]">
              <p>SKU: {product.sku ?? 'Não informado'}</p>
              <p>Disponibilidade: {product.stock > 0 ? `${product.stock} disponíveis` : 'Indisponível'}</p>
            </div>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-4 text-xl font-semibold text-[#2d1d25]">Produtos relacionados</h2>
          <div className="grid grid-cols-2 gap-2 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function CartPage() {
  const { items, updateQuantity, removeItem, refreshFromCatalog, clearCart } = useCart();
  const { catalog, isLoading: catalogLoading, loadError: catalogError } = useStorefrontProducts();
  const {
    whatsappNumber,
    whatsappOrderMessage,
    loading: settingsLoading,
    error: settingsError,
  } = useStoreSettings();
  const [checkoutError, setCheckoutError] = useState('');
  const [isCheckoutStarting, setIsCheckoutStarting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const pendingOrderRef = useRef<{ id: string; number: string; subtotal_cents: number } | null>(null);
  const pendingOrderPromiseRef = useRef<Promise<{ id: string; number: string; subtotal_cents: number }> | null>(null);
  const idempotencySignatureRef = useRef('');
  const idempotencyKeyRef = useRef('');
  const productsById = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog]);
  const cartItems = useMemo(() => items.map((item) => {
    const product = productsById.get(item.id);
    return product
      ? {
          ...item,
          name: product.name,
          image: product.image,
          unitPrice: product.sale_price_cents ?? product.price_cents,
          sku: product.sku,
          availableStock: product.stock,
        }
      : item;
  }), [items, productsById]);

  useEffect(() => {
    if (!catalogLoading && !catalogError) refreshFromCatalog(catalog);
  }, [catalog, catalogError, catalogLoading, refreshFromCatalog]);

  const summary = getCartSummary(cartItems.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })));
  const unavailableItems = cartItems.filter((item) => {
    const currentProduct = productsById.get(item.id);
    return !currentProduct || item.quantity > currentProduct.stock;
  });
  const canCheckout = Boolean(
    items.length > 0 &&
    whatsappNumber &&
    !settingsLoading &&
    !settingsError &&
    !catalogLoading &&
    !catalogError &&
    unavailableItems.length === 0,
  );

  const orderSignature = useMemo(
    () => JSON.stringify(cartItems.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      variation: item.variation ?? null,
    }))),
    [cartItems],
  );

  async function handleStartWhatsAppOrder() {
    if (!canCheckout || isCheckoutStarting) return;
    setIsCheckoutStarting(true);
    setCheckoutError('');
    try {
      if (idempotencySignatureRef.current !== orderSignature) {
        idempotencySignatureRef.current = orderSignature;
        idempotencyKeyRef.current = typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        pendingOrderRef.current = null;
        pendingOrderPromiseRef.current = null;
      }
      const orderItems = cartItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        name: item.name,
        variation: item.variation,
        sku: item.sku,
        link: `${window.location.origin}/produto/${catalog.find((product) => product.id === item.id)?.slug ?? item.id}`,
      }));

      performance.mark('madu:checkout-click');

      let order = pendingOrderRef.current;
      if (!order) {
        if (!pendingOrderPromiseRef.current) {
          pendingOrderPromiseRef.current = createWhatsAppOrder({
            items: cartItems.map((item) => ({
              product_id: item.id,
              quantity: item.quantity,
              variation: item.variation,
            })),
            customerName,
            customerPhone,
            idempotencyKey: idempotencyKeyRef.current,
          });
        }
        order = await pendingOrderPromiseRef.current;
        pendingOrderRef.current = order;
      }

      const message = buildOrderWhatsAppMessage({
        orderNumber: order.number,
        items: orderItems,
        subtotal: order.subtotal_cents,
        template: whatsappOrderMessage,
      });
      void trackStorefrontEvent('whatsapp_checkout');
      performance.measure('madu:checkout-to-whatsapp', 'madu:checkout-click');
      window.location.assign(buildWhatsAppUrl(whatsappNumber, message));
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Não foi possível iniciar o pedido.');
    } finally {
      setIsCheckoutStarting(false);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[#2d1d25]">Carrinho</h1>
          {items.length > 0 && (
            <button type="button" onClick={clearCart} className="text-sm font-medium text-[#8B5E7C]">
              Limpar carrinho
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[#d7b0c0] bg-white p-10 text-center text-[#5d4454]">
            Seu carrinho está vazio. <Link to="/produtos" className="font-medium text-[#8B5E7C]">Explore as peças</Link>.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              {cartItems.map((item) => (
                <div key={`${item.id}-${item.variation ?? 'base'}`} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-2xl border border-[#e9abc8] bg-white p-3 shadow-sm sm:grid-cols-[120px_1fr] sm:gap-4 sm:rounded-[2rem] sm:p-4">
                  <img src={item.image} alt={item.name} loading="lazy" decoding="async" className="aspect-square h-auto w-full rounded-xl bg-[#fffafc] object-contain sm:rounded-2xl" />
                  <div className="flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-[#2d1d25]">{item.name}</h2>
                        <p className="text-sm text-[#5d4454]">{item.variation ?? 'Sem variação'}</p>
                      </div>
                      <button type="button" onClick={() => { removeItem(item.id, item.variation); void trackStorefrontEvent('remove_from_cart', { productId: item.id }); }} className="text-sm text-[#8B5E7C]">Remover</button>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center overflow-hidden rounded-full border border-[#efd7e7] bg-[#fffafc]">
                            <button type="button" onClick={() => updateQuantity(item.id, item.variation, item.quantity - 1)} className="inline-flex min-h-11 min-w-11 items-center justify-center p-2 text-[#8B5E7C]" aria-label="Diminuir quantidade">
                          <Minus size={14} />
                        </button>
                        <span className="min-w-8 text-center text-sm font-medium text-[#2d1d25]">{item.quantity}</span>
                        <button type="button" disabled={item.availableStock !== undefined && item.quantity >= item.availableStock} onClick={() => updateQuantity(item.id, item.variation, item.quantity + 1)} className="inline-flex min-h-11 min-w-11 items-center justify-center p-2 text-[#8B5E7C] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Aumentar quantidade">
                          <Plus size={14} />
                        </button>
                      </div>
                      <p className="text-base font-semibold text-[#2d1d25]">{formatCurrency(item.unitPrice * item.quantity)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <aside className="rounded-[2rem] border border-[#f1dfe9] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-semibold text-[#2d1d25]">Resumo do pedido</h2>
              <div className="mt-5 space-y-3 text-sm text-[#5d4454]">
                <div className="flex justify-between"><span>Itens</span><span>{summary.totalUnits}</span></div>
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(summary.subtotal)}</span></div>
                <div className="flex justify-between"><span>Frete</span><span>a combinar</span></div>
              </div>
              <div className="my-5 h-px bg-[#f1dfe9]" />
              <div className="flex items-center justify-between text-lg font-semibold text-[#2d1d25]">
                <span>Total</span>
                <span>{formatCurrency(summary.subtotal)}</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <input
                  type="text"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Seu nome (opcional)"
                  autoComplete="name"
                  className="min-h-11 rounded-full border border-[#efd7e7] bg-[#fffafc] px-4 text-sm outline-none"
                />
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="Seu WhatsApp (opcional)"
                  autoComplete="tel"
                  className="min-h-11 rounded-full border border-[#efd7e7] bg-[#fffafc] px-4 text-sm outline-none"
                />
              </div>
              {unavailableItems.length > 0 && (
              <p role="alert" className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
                Revise os itens indisponíveis ou ajuste a quantidade ao estoque atual antes de continuar.
              </p>
              )}
              {catalogError && <p role="alert" className="mt-4 text-sm text-red-700">{catalogError}</p>}
              {settingsError && <p role="alert" className="mt-4 text-sm text-red-700">{settingsError}</p>}
              {checkoutError && <p role="alert" className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{checkoutError}</p>}
              {!settingsLoading && !settingsError && !whatsappNumber && (
              <p role="status" className="mt-4 text-sm text-[#76506a]">O WhatsApp comercial ainda não foi configurado.</p>
              )}
              {canCheckout ? (
              <>
              <button
                type="button"
                onClick={() => void handleStartWhatsAppOrder()}
                disabled={isCheckoutStarting}
                className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[#8B5E7C] px-5 py-3 text-sm font-medium text-white shadow-md"
              >
                {isCheckoutStarting ? 'Preparando pedido...' : 'Finalizar pedido pelo WhatsApp'}
              </button>
              <p className="mt-3 text-center text-xs leading-5 text-[#76506a]">
                Seu pedido será enviado pelo WhatsApp. Confirmaremos a disponibilidade, o pagamento e a entrega com você.
              </p>
              </>
              ) : (
              <button
                type="button"
                disabled
                className="mt-6 inline-flex w-full cursor-not-allowed items-center justify-center rounded-full bg-[#8B5E7C]/50 px-5 py-3 text-sm font-medium text-white"
              >
                {catalogLoading || settingsLoading ? 'Verificando dados do pedido...' : 'WhatsApp indisponível'}
              </button>
              )}
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut, role } = useAdminAuth();
  const { categories } = useCatalogCategories();
  const isAdmin = role === 'admin';
  const {
    catalog,
    syncStatus,
    refreshCatalog,
    addConfirmedProduct,
    removeConfirmedProduct,
  } = useStorefrontProducts(true);
  const [productForm, setProductForm] = useState<ProductFormValues>(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<ProductFormErrors>({});
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  const isProductFormDirty =
    JSON.stringify(productForm) !== JSON.stringify(emptyProductForm) || selectedImageFile !== null;

  function updateProductForm<K extends ProductFormField>(field: K, value: ProductFormValues[K]) {
    setProductForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: undefined }));
    setSaveMessage('');
  }

  function resetProductForm() {
    setProductForm(emptyProductForm);
    setEditingProductId(null);
    setSelectedImageFile(null);
    setUploadedImageUrl(null);
    setFormErrors({});
    setSaveMessage('');
  }

  function handleImageFileChange(file: File) {
    const error = validateProductImageFile(file);
    if (error) {
      setFormErrors((current) => ({ ...current, image: error }));
      setSaveMessage('');
      return;
    }

    setSelectedImageFile(file);
    setUploadedImageUrl(null);
    setFormErrors((current) => ({ ...current, image: undefined }));
    setSaveMessage('');
  }

  function handleEditProduct(product: ProductView) {
    if (!confirmDiscardProductForm()) return;

    setEditingProductId(product.id);
    setSelectedImageFile(null);
    setUploadedImageUrl(null);
    setFormErrors({});
    setSaveMessage('');
    setProductForm({
      name: product.name,
      category: product.category,
      sku: product.sku ?? '',
      description: product.description,
      price: (product.price_cents / 100).toFixed(2).replace('.', ','),
      salePrice: product.sale_price_cents === undefined
        ? ''
        : (product.sale_price_cents / 100).toFixed(2).replace('.', ','),
      stock: String(product.stock),
      image: product.image,
      variations: product.variations?.join(', ') ?? '',
      featured: product.featured ?? false,
      isActive: product.is_active !== false,
      material: product.material ?? '',
      measurements: product.measurements ?? '',
      characteristics: product.characteristics ?? '',
      care: product.care ?? '',
      warranty: product.warranty ?? '',
    });
    document.getElementById('cadastro-produto')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleDeleteProduct(product: ProductView) {
    if (!isAdmin || isSavingProduct || deletingProductId) return;
    if (!window.confirm(`Remover o produto "${product.name}" do catálogo? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setDeletingProductId(product.id);
    setSaveMessage('');
    try {
      const result = await deleteProductFromSupabase(product.id);
      if (!result.ok) {
        setSaveMessage(`Não foi possível remover o produto: ${result.reason}`);
        return;
      }

      removeConfirmedProduct(product.id);
      if (editingProductId === product.id) resetProductForm();
      setSaveMessage(`Produto "${product.name}" removido do catálogo.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Erro inesperado ao remover o produto.';
      setSaveMessage(`Não foi possível remover o produto: ${reason}`);
    } finally {
      setDeletingProductId(null);
    }
  }

  function confirmDiscardProductForm() {
    if (isSavingProduct) {
      setSaveMessage('Aguarde a conclusão do salvamento antes de sair.');
      return false;
    }
    if (!isProductFormDirty) return true;
    if (!window.confirm('Há alterações não salvas. Deseja descartá-las?')) return false;
    resetProductForm();
    return true;
  }

  useEffect(() => {
    if (!isProductFormDirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isProductFormDirty]);

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deletingProductId) return;

    const errors = validateProductForm(productForm, selectedImageFile !== null);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaveMessage('Revise os campos destacados antes de salvar.');
      return;
    }

    const product = createProductFromForm(
      productForm,
      editingProductId ?? undefined,
      selectedImageFile !== null,
    );
    if (!product) {
      setSaveMessage('Não foi possível preparar os dados do produto. Revise o formulário.');
      return;
    }

    setIsSavingProduct(true);
    setSaveMessage('');
    const wasEditing = Boolean(editingProductId);

    try {
      let productToSave = product;
      if (selectedImageFile) {
        let publicUrl = uploadedImageUrl;
        if (!publicUrl) {
          const uploadResult = await uploadProductImage(selectedImageFile, product.id);
          if (!uploadResult.ok) {
            setSaveMessage(`Não foi possível salvar o produto: ${uploadResult.reason}`);
            return;
          }
          publicUrl = uploadResult.publicUrl;
          setUploadedImageUrl(publicUrl);
        }
        productToSave = { ...product, image: publicUrl };
      }

      const result = editingProductId
        ? await updateProductInSupabase(productToSave)
        : await saveProductToSupabase(productToSave);
      if (!result.ok) {
        setSaveMessage(`Não foi possível salvar o produto: ${result.reason}`);
        return;
      }

      addConfirmedProduct(result.product);
      const refreshedCatalog = await refreshCatalog();
      if (refreshedCatalog && !refreshedCatalog.some((item) => item.id === result.product.id)) {
        addConfirmedProduct(result.product);
      }

      resetProductForm();
      setSaveMessage(
        refreshedCatalog
          ? `Produto ${wasEditing ? 'atualizado' : 'salvo'} e catálogo atualizado.`
          : `Produto ${wasEditing ? 'atualizado' : 'salvo'} no Supabase. Não foi possível atualizar a lista agora; tente recarregá-la.`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Erro inesperado ao salvar o produto.';
      setSaveMessage(`Não foi possível salvar o produto: ${reason}`);
    } finally {
      setIsSavingProduct(false);
    }
  }

  const stats = [
    { label: 'Produtos', value: String(catalog.length), tone: 'pink' },
    { label: 'Categorias', value: String(new Set(catalog.map((product) => product.category)).size), tone: 'purple' },
    { label: 'Unidades em estoque', value: String(catalog.reduce((sum, product) => sum + product.stock, 0)), tone: 'lavender' },
    { label: 'Estoque baixo', value: String(catalog.filter((product) => product.stock > 0 && product.stock <= 3).length), tone: 'rose' },
  ];

  const categorySummary = [...new Set(catalog.map((product) => product.category))]
    .map((category) => ({
      name: category,
      count: catalog.filter((product) => product.category === category).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const largestCategoryCount = Math.max(1, ...categorySummary.map((category) => category.count));

  const visibleCatalog = catalog.filter((product) => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return true;
    return product.name.toLowerCase().includes(term) || product.category.toLowerCase().includes(term);
  });
  const activeAdminPage: AdminPageId = location.pathname === '/admin/produtos' ? 'produtos' : 'dashboard';

  async function handleAdminLogout() {
    if (!confirmDiscardProductForm()) return;
    const error = await signOut();
    if (error) {
      setAuthMessage(`Não foi possível encerrar a sessão: ${error}`);
      return;
    }
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#f9eff4] text-[#2d1d25]">
      <div className="flex min-h-screen">
        <MaduSidebar
          activePage={activeAdminPage}
          mobileOpen={mobileMenuOpen}
          onLogout={() => void handleAdminLogout()}
          onClose={() => setMobileMenuOpen(false)}
          onNavigate={(page) => {
            if (!confirmDiscardProductForm()) return;
            navigate(adminPaths[page]);
          }}
        />
        <main className="min-w-0 flex-1 bg-[#fffafc] px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:p-7 lg:p-9">
            <header className="mb-5 flex min-w-0 flex-col gap-3 border-b border-[#f1dfe9] pb-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <button
                  type="button"
                  aria-label="Abrir menu"
                  onClick={() => setMobileMenuOpen(true)}
                  className="mb-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#efd7e7] bg-white text-[#8B5E7C] md:hidden"
                >
                  <Menu size={18} />
                </button>
                <p className="text-xs uppercase tracking-[0.24em] text-[#8B5E7C]">{isAdmin ? 'Dashboard' : 'Catálogo'}</p>
                <h2 className="mt-1 break-words text-xl font-semibold sm:text-2xl">{isAdmin ? 'Painel da loja' : 'Produtos'}</h2>
              </div>

              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:gap-3">
                <div className="relative min-w-0 sm:w-56 lg:w-72">
                  <Search className="pointer-events-none absolute left-3 top-3 text-[#8B5E7C]" size={16} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Buscar produto"
                    className="min-h-11 w-full min-w-0 rounded-full border border-[#efd7e7] bg-white py-2.5 pl-9 pr-3 text-sm text-[#2d1d25] outline-none"
                  />
                </div>
                <Link
                  to="/"
                  onClick={(event) => {
                    if (!confirmDiscardProductForm()) event.preventDefault();
                  }}
                  className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-full bg-[#8B5E7C] px-3 text-center text-xs font-medium text-white shadow-sm sm:px-4 sm:text-sm"
                >
                  Ver loja
                </Link>
              </div>
            </header>

            <div className="mb-6 rounded-2xl border border-[#f1dfe9] bg-[#fef3f8] px-4 py-3 text-xs text-[#5d4454]">
              {syncStatus}
            </div>
            {authMessage && <p role="alert" className="mb-5 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{authMessage}</p>}

            {isAdmin && <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-[1.5rem] border border-[#f1dfe9] bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.18em] text-[#8B5E7C]">{stat.label}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${stat.tone === 'pink' ? 'bg-[#f7cdd9]' : stat.tone === 'purple' ? 'bg-[#d9c7f2]' : stat.tone === 'lavender' ? 'bg-[#ead9f5]' : 'bg-[#f5d1db]'}`} />
                  </div>
                  <p className="text-2xl font-semibold text-[#2d1d25]">{stat.value}</p>
                </div>
              ))}
            </section>}

            {isAdmin && <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
              <div className="rounded-[1.75rem] border border-[#f1dfe9] bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[#8B5E7C]">Catálogo</p>
                    <h3 className="mt-2 text-xl font-semibold text-[#2d1d25]">Produtos por categoria</h3>
                  </div>
                  <span className="rounded-full bg-[#f8e9ef] px-2.5 py-1 text-xs font-medium text-[#8B5E7C]">
                    {catalog.length} produtos
                  </span>
                </div>

                {categorySummary.length > 0 ? (
                  <div className="space-y-4">
                    {categorySummary.map((category) => (
                      <div key={category.name}>
                        <div className="mb-1.5 flex justify-between text-sm">
                          <span className="text-[#5d4454]">{category.name}</span>
                          <span className="font-medium text-[#2d1d25]">{category.count}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-[#f8e9ef]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#8B5E7C] to-[#d6a9c5]"
                            style={{ width: `${(category.count / largestCategoryCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl bg-[#fffafc] p-4 text-sm text-[#5d4454]">Nenhum produto cadastrado.</p>
                )}
              </div>

              <div className="rounded-[1.75rem] border border-[#f1dfe9] bg-white p-5 shadow-sm sm:p-6">
                <h3 className="text-lg font-semibold text-[#2d1d25]">Acesso rápido</h3>
                <p className="mt-1 text-sm text-[#5d4454]">Atalhos para gerenciar o catálogo.</p>
                <div className="mt-4 space-y-3">
                  <a href="#produtos" className="flex items-center justify-between rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-4 py-3 text-sm text-[#2d1d25]">
                    <span>Gerenciar catálogo</span><ArrowRight size={16} />
                  </a>
                  <a href="#cadastro-produto" className="flex items-center justify-between rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-4 py-3 text-sm text-[#2d1d25]">
                    <span>Cadastrar produto</span><ArrowRight size={16} />
                  </a>
                  <Link to="/admin/usuarios" className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-4 py-3 text-sm text-[#2d1d25]">
                    <span>Gerenciar administradores</span><ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </section>}

            <section id="produtos" className="mt-5 grid min-w-0 gap-4 xl:mt-6 xl:grid-cols-[1.2fr_0.8fr] xl:gap-6">
              <div className="min-w-0 rounded-[1.75rem] border border-[#f1dfe9] bg-white p-3 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[#2d1d25]">Produtos do catálogo</h3>
                </div>

                <div className="space-y-3 md:hidden">
                  {visibleCatalog.map((product) => (
                    <article key={product.id} className="rounded-2xl border border-[#f1dfe9] bg-[#fffafc] p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <img src={product.image} alt="" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                        <div className="min-w-0 flex-1">
                          <h4 className="break-words text-sm font-semibold text-[#2d1d25]">{product.name}</h4>
                          <p className="mt-1 truncate text-xs text-[#76506a]">{product.category}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#f8e9ef] px-2 py-1 text-[10px] text-[#76506a]">
                          {product.is_active === false ? 'Oculto' : 'Ativo'}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#5d4454]">
                        <p>Preço <span className="font-semibold text-[#2d1d25]">{formatCurrency(product.sale_price_cents ?? product.price_cents)}</span></p>
                        <p>Estoque <span className="font-semibold text-[#2d1d25]">{product.stock}</span></p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-[#f1dfe9] pt-3">
                        <button
                          type="button"
                          disabled={isSavingProduct || Boolean(deletingProductId)}
                          onClick={() => handleEditProduct(product)}
                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[#efd7e7] px-3 text-xs font-medium text-[#76506a] disabled:opacity-60"
                        >
                          <Pencil size={14} /> Editar
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            disabled={isSavingProduct || Boolean(deletingProductId)}
                            onClick={() => void handleDeleteProduct(product)}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-rose-200 px-3 text-xs font-medium text-rose-700 disabled:opacity-60"
                          >
                            <Trash2 size={14} />
                            {deletingProductId === product.id ? 'Removendo...' : 'Remover'}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                  {visibleCatalog.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-[#d7b0c0] p-5 text-center text-sm text-[#5d4454]">
                      Nenhum produto corresponde à busca.
                    </p>
                  )}
                </div>

                <div role="region" aria-label="Tabela de produtos. Deslize horizontalmente para ver todos os dados." tabIndex={0} className="hidden overflow-x-auto rounded-2xl border border-[#f1dfe9] md:block">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#fff5f9] text-[#5d4454]">
                      <tr>
                        <th className="px-4 py-3 font-medium">Produto</th>
                        <th className="px-4 py-3 font-medium">Categoria</th>
                        <th className="px-4 py-3 font-medium">Preço</th>
                        <th className="px-4 py-3 font-medium">Estoque</th>
                        <th className="px-4 py-3 font-medium">Vitrine</th>
                        <th className="px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCatalog.map((product) => (
                        <tr key={product.id} className="border-t border-[#f1dfe9]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <img src={product.image} alt={product.name} loading="lazy" decoding="async" className="h-10 w-10 rounded-xl object-cover" />
                              <span className="font-medium text-[#2d1d25]">{product.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[#5d4454]">{product.category}</td>
                          <td className="px-4 py-3 font-medium text-[#2d1d25]">{formatCurrency(product.sale_price_cents ?? product.price_cents)}</td>
                          <td className="px-4 py-3 text-[#5d4454]">{product.stock}</td>
                          <td className="px-4 py-3 text-[#5d4454]">{product.is_active === false ? 'Oculto' : 'Ativo'}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              disabled={isSavingProduct || Boolean(deletingProductId)}
                              onClick={() => handleEditProduct(product)}
                              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#efd7e7] px-3 text-xs font-medium text-[#76506a] hover:bg-[#fff5f9] disabled:opacity-60"
                            >
                              <Pencil size={14} />
                              Editar
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                disabled={isSavingProduct || Boolean(deletingProductId)}
                                onClick={() => void handleDeleteProduct(product)}
                                aria-label={`Remover ${product.name}`}
                                className="ml-2 inline-flex min-h-10 items-center gap-2 rounded-full border border-rose-200 px-3 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Trash2 size={14} />
                                {deletingProductId === product.id ? 'Removendo...' : 'Remover'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {visibleCatalog.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#5d4454]">
                            Nenhum produto corresponde à busca.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <div id="cadastro-produto" className="rounded-[1.75rem] border border-[#f1dfe9] bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-[#2d1d25]">
                    {editingProductId ? 'Editar produto' : 'Cadastrar produto'}
                  </h3>
                  <form onSubmit={handleSaveProduct} noValidate className="mt-4">
                    <fieldset disabled={isSavingProduct || Boolean(deletingProductId)} className="space-y-3">
                    <label className="block text-sm text-[#5d4454]">
                      Nome do produto *
                      <input required value={productForm.name} onChange={(event) => updateProductForm('name', event.target.value)} aria-invalid={Boolean(formErrors.name)} className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-[#2d1d25] outline-none" />
                      {formErrors.name && <span className="mt-1 block text-xs text-red-700">{formErrors.name}</span>}
                    </label>
                    <label className="block text-sm text-[#5d4454]">
                      Categoria *
                      <select required value={productForm.category} onChange={(event) => updateProductForm('category', event.target.value)} aria-invalid={Boolean(formErrors.category)} className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-[#2d1d25] outline-none">
                        <option value="">Selecione uma categoria</option>
                        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                      {formErrors.category && <span className="mt-1 block text-xs text-red-700">{formErrors.category}</span>}
                    </label>
                    <label className="block text-sm text-[#5d4454]">
                      SKU
                      <input value={productForm.sku} onChange={(event) => updateProductForm('sku', event.target.value)} aria-invalid={Boolean(formErrors.sku)} className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-[#2d1d25] outline-none" />
                      {formErrors.sku && <span className="mt-1 block text-xs text-red-700">{formErrors.sku}</span>}
                    </label>
                    <label className="block text-sm text-[#5d4454]">
                      Descrição
                      <textarea value={productForm.description} onChange={(event) => updateProductForm('description', event.target.value)} rows={3} className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-[#2d1d25] outline-none" />
                    </label>
                    <div className="grid gap-3 rounded-2xl border border-[#f1dfe9] bg-[#fffafc] p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-[#76506a]">Informações complementares opcionais</p>
                      <label className="block text-sm text-[#5d4454]">Material<input value={productForm.material} onChange={(event) => updateProductForm('material', event.target.value)} placeholder="Somente se estiver cadastrado" className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-white px-3 py-2 text-[#2d1d25] outline-none" /></label>
                      <label className="block text-sm text-[#5d4454]">Medidas<input value={productForm.measurements} onChange={(event) => updateProductForm('measurements', event.target.value)} placeholder="Somente se estiver cadastrado" className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-white px-3 py-2 text-[#2d1d25] outline-none" /></label>
                      <label className="block text-sm text-[#5d4454]">Características<textarea rows={2} value={productForm.characteristics} onChange={(event) => updateProductForm('characteristics', event.target.value)} className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-white px-3 py-2 text-[#2d1d25] outline-none" /></label>
                      <label className="block text-sm text-[#5d4454]">Cuidados<textarea rows={2} value={productForm.care} onChange={(event) => updateProductForm('care', event.target.value)} className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-white px-3 py-2 text-[#2d1d25] outline-none" /></label>
                      <label className="block text-sm text-[#5d4454]">Garantia<input value={productForm.warranty} onChange={(event) => updateProductForm('warranty', event.target.value)} placeholder="Somente se houver garantia cadastrada" className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-white px-3 py-2 text-[#2d1d25] outline-none" /></label>
                    </div>
                    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                      <label className="block text-sm text-[#5d4454]">
                        Preço de venda *
                        <input required type="text" inputMode="decimal" placeholder="89,90" value={productForm.price} onChange={(event) => updateProductForm('price', event.target.value)} aria-invalid={Boolean(formErrors.price)} className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-[#2d1d25] outline-none" />
                        {formErrors.price && <span className="mt-1 block text-xs text-red-700">{formErrors.price}</span>}
                      </label>
                      <label className="block text-sm text-[#5d4454]">
                        Preço promocional
                        <input type="text" inputMode="decimal" placeholder="Opcional" value={productForm.salePrice} onChange={(event) => updateProductForm('salePrice', event.target.value)} aria-invalid={Boolean(formErrors.salePrice)} className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-[#2d1d25] outline-none" />
                        {formErrors.salePrice && <span className="mt-1 block text-xs text-red-700">{formErrors.salePrice}</span>}
                      </label>
                    </div>
                    <label className="block text-sm text-[#5d4454]">
                      Quantidade inicial em estoque *
                      <input required type="number" min="0" step="1" inputMode="numeric" value={productForm.stock} onChange={(event) => updateProductForm('stock', event.target.value)} aria-invalid={Boolean(formErrors.stock)} className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-[#2d1d25] outline-none" />
                      {formErrors.stock && <span className="mt-1 block text-xs text-red-700">{formErrors.stock}</span>}
                    </label>
                    <ProductImageField
                      currentImage={productForm.image}
                      selectedFile={selectedImageFile}
                      error={formErrors.image}
                      disabled={isSavingProduct || Boolean(deletingProductId)}
                      onFileChange={handleImageFileChange}
                    />
                    <label className="block text-sm text-[#5d4454]">
                      Variações
                      <input value={productForm.variations} onChange={(event) => updateProductForm('variations', event.target.value)} placeholder="Ex.: Dourado, Prata" className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-3 py-2 text-[#2d1d25] outline-none" />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[#5d4454]">
                      <input type="checkbox" checked={productForm.featured} onChange={(event) => updateProductForm('featured', event.target.checked)} className="h-4 w-4 accent-[#8B5E7C]" />
                      Produto em destaque
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[#5d4454]">
                      <input type="checkbox" checked={productForm.isActive} onChange={(event) => updateProductForm('isActive', event.target.checked)} className="h-4 w-4 accent-[#8B5E7C]" />
                      Produto visível na vitrine
                    </label>
                    {saveMessage ? <p role="status" className="text-sm text-[#5d4454]">{saveMessage}</p> : null}
                    <button type="submit" disabled={isSavingProduct} className="w-full rounded-full bg-[#8B5E7C] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60">
                      {isSavingProduct
                        ? 'Salvando produto...'
                        : editingProductId ? 'Salvar alterações' : 'Salvar produto'}
                    </button>
                    {editingProductId && (
                      <button
                        type="button"
                        disabled={isSavingProduct}
                        onClick={() => {
                          if (confirmDiscardProductForm()) resetProductForm();
                        }}
                        className="w-full rounded-full border border-[#efd7e7] px-4 py-3 text-sm font-medium text-[#76506a] disabled:opacity-60"
                      >
                        Cancelar edição
                      </button>
                    )}
                    </fieldset>
                  </form>
                </div>

              </div>
            </section>
        </main>
      </div>
    </div>
  );
}

function WhatsAppSettingsForm() {
  const {
    whatsappNumber,
    whatsappOrderMessage,
    loading,
    error: settingsError,
    saveWhatsappNumber,
    saveWhatsappOrderMessage,
  } = useStoreSettings();
  const [numberInput, setNumberInput] = useState(whatsappNumber);
  const [messageInput, setMessageInput] = useState(whatsappOrderMessage);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isMessageDirty, setIsMessageDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isDirty) setNumberInput(whatsappNumber);
  }, [whatsappNumber, isDirty]);

  useEffect(() => {
    if (!isMessageDirty) setMessageInput(whatsappOrderMessage);
  }, [whatsappOrderMessage, isMessageDirty]);

  const normalizedPreview = normalizeWhatsAppNumber(numberInput);

  function insertWhatsAppEmoji(emoji: string) {
    const textarea = messageTextareaRef.current;
    if (!textarea) {
      setMessageInput((current) => `${current}${emoji}`);
      setIsMessageDirty(true);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const updated = `${messageInput.slice(0, start)}${emoji}${messageInput.slice(end)}`;
    setMessageInput(updated);
    setIsMessageDirty(true);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage('');
    setFormError('');
    try {
      await saveWhatsappNumber(numberInput);
      await saveWhatsappOrderMessage(messageInput);
      setIsDirty(false);
      setIsMessageDirty(false);
      setMessage('WhatsApp comercial e mensagem do pedido salvos.');
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Erro inesperado ao salvar o WhatsApp.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="max-w-2xl space-y-4">
      {settingsError && <p role="alert" className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{settingsError}</p>}
      <label className="block text-sm font-medium text-[#5d4454]">
        Número comercial do WhatsApp
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={numberInput}
          onChange={(event) => {
            setNumberInput(event.target.value);
            setIsDirty(true);
            setMessage('');
            setFormError('');
          }}
          placeholder="+55 11 99999-9999"
          aria-invalid={Boolean(formError)}
          className="mt-1 min-h-12 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-4 text-[#2d1d25] outline-none focus:border-[#8B5E7C]"
        />
      </label>
      <p className="text-xs leading-5 text-[#76506a]">Use o código do país; no Brasil, DDD e número. A loja exibirá o número confirmado no Supabase.</p>
      <label className="block text-sm font-medium text-[#5d4454]">
        Texto do pedido enviado pelo WhatsApp
        <textarea
          ref={messageTextareaRef}
          value={messageInput}
          onChange={(event) => {
            setMessageInput(event.target.value);
            setIsMessageDirty(true);
            setMessage('');
            setFormError('');
          }}
          rows={14}
          required
          className="mt-1 w-full rounded-2xl border border-[#efd7e7] bg-[#fffafc] px-4 py-3 text-sm leading-6 text-[#2d1d25] outline-none focus:border-[#8B5E7C]"
        />
      </label>
      <div>
        <p className="mb-2 text-xs font-medium text-[#76506a]">Emojis para WhatsApp (iPhone e Android)</p>
        <div className="flex flex-wrap gap-1.5" aria-label="Emojis compatíveis com WhatsApp">
          {WHATSAPP_COMPATIBLE_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertWhatsAppEmoji(emoji)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#efd7e7] bg-white text-xl transition hover:border-[#8B5E7C] hover:bg-[#fff5f9]"
              aria-label={`Inserir emoji ${emoji}`}
              title={`Inserir ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs leading-5 text-[#76506a]">
        Placeholders disponíveis: <code>{'{order_number}'}</code>, <code>{'{items}'}</code> e <code>{'{subtotal}'}</code>.
        A lista de produtos será inserida automaticamente em {'{items}'}.
      </p>
      {normalizedPreview ? (
        <a
          href={buildWhatsAppUrl(normalizedPreview, 'Olá! Vim pelo site da MADU.')}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-full border border-[#efd7e7] px-4 text-sm text-[#76506a]"
        >
          Testar WhatsApp configurado
        </a>
      ) : numberInput.trim() ? (
        <p role="alert" className="text-sm text-red-700">Informe um telefone válido com código do país.</p>
      ) : (
        <p className="text-sm text-[#76506a]">Nenhum WhatsApp comercial configurado.</p>
      )}
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      {message && <p role="status" className="text-sm text-[#5d4454]">{message}</p>}
      <button
        type="submit"
        disabled={isSaving || loading || !normalizedPreview}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B5E7C] px-6 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? 'Salvando...' : 'Salvar WhatsApp'}
      </button>
    </form>
  );
}

const adminPaths: Record<AdminPageId, string> = {
  dashboard: '/admin',
  produtos: '/admin/produtos',
  categorias: '/admin/categorias',
  pedidos: '/admin/pedidos',
  clientes: '/admin/clientes',
  estoque: '/admin/estoque',
  financeiro: '/admin/financeiro',
  configuracoes: '/admin/configuracoes',
  usuarios: '/admin/usuarios',
};

function AdminModulePage() {
  const { module = '' } = useParams();
  const navigate = useNavigate();
  const { signOut, role } = useAdminAuth();
  const { categories } = useCatalogCategories();
  const { catalog, syncStatus } = useStorefrontProducts(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const modulePages: Record<string, { id: AdminPageId; title: string; description: string }> = {
    categorias: {
      id: 'categorias',
      title: 'Categorias',
      description: 'Gerencie as categorias da loja em um fluxo dinâmico, com nomes, ordem de exibição e controle de visibilidade.',
    },
    pedidos: {
      id: 'pedidos',
      title: 'Pedidos',
      description: 'Pedidos registrados antes da abertura do WhatsApp, com confirmação manual e controle seguro do estoque.',
    },
    clientes: {
      id: 'clientes',
      title: 'Clientes',
      description: 'Não há cadastro de clientes ou histórico de pedidos persistido. Nenhum dado de cliente é exibido ou inventado nesta área.',
    },
    estoque: {
      id: 'estoque',
      title: 'Estoque',
      description: 'Saldo atual dos produtos e histórico completo de entradas, vendas, estornos e ajustes.',
    },
    financeiro: {
      id: 'financeiro',
      title: 'Financeiro',
      description: 'O sistema não registra pagamentos nem status financeiro. Como os pedidos são concluídos por WhatsApp, não há valores pagos ou pendentes disponíveis para exibir.',
    },
    configuracoes: {
      id: 'configuracoes',
      title: 'Configurações',
      description: 'Configure o WhatsApp comercial usado nos links da vitrine e na finalização do carrinho.',
    },
    usuarios: {
      id: 'usuarios',
      title: 'Usuários e permissões',
      description: 'Consulte os administradores autorizados da loja e revogue acessos quando necessário.',
    },
  };
  const currentModule = modulePages[module];

  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) {
      setCategoryError('Informe o nome da categoria antes de salvar.');
      return;
    }

    setIsSavingCategory(true);
    setCategoryError('');
    setCategoryMessage('');

    try {
      const result = await saveCategoryToSupabase({ name, is_active: true, position: categories.length + 1 });
      if (!result.ok) {
        setCategoryError(result.reason);
        return;
      }

      setNewCategoryName('');
      setCategoryMessage(`Categoria "${result.category.name}" adicionada ao catálogo.`);
      const refreshed = await getCategoriesFromSupabase(true);
      if (refreshed.length > 0) {
        setCategoryMessage(`Categoria "${result.category.name}" adicionada e sincronizada.`);
      }
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'Não foi possível criar a categoria.');
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function handleDeleteCategory(categoryName: string) {
    if (!window.confirm(`Remover a categoria "${categoryName}"? Produtos vinculados continuam disponíveis, mas o item deixa de aparecer na vitrine.`)) {
      return;
    }

    try {
      const match = defaultCategories.find((item) => item.name === categoryName);
      const result = await deleteCategoryFromSupabase(match?.id ?? categoryName);
      if (!result.ok) {
        setCategoryError(result.reason);
        return;
      }
      setCategoryMessage(`Categoria "${categoryName}" removida.`);
      setCategoryError('');
      setNewCategoryName('');
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : 'Não foi possível remover a categoria.');
    }
  }

  async function handleLogout() {
    const error = await signOut();
    if (error) {
      setMessage(`Não foi possível encerrar a sessão: ${error}`);
      return;
    }
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-[#f9eff4] text-[#2d1d25]">
      <div className="flex min-h-dvh">
        <MaduSidebar
          activePage={currentModule?.id ?? 'dashboard'}
          mobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          onLogout={() => void handleLogout()}
          onNavigate={(page) => navigate(adminPaths[page])}
        />
        <main className="min-w-0 flex-1 bg-[#fffafc] px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 sm:p-7 lg:p-9">
          <header className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[#f1dfe9] pb-4 sm:mb-6">
            <div className="min-w-0 flex-1">
              <button
                type="button"
                aria-label="Abrir menu"
                onClick={() => setMobileMenuOpen(true)}
                className="mb-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#efd7e7] bg-white text-[#8B5E7C] md:hidden"
              >
                <Menu size={18} />
              </button>
              <p className="text-xs uppercase tracking-[0.24em] text-[#8B5E7C]">Painel administrativo</p>
              <h1 className="mt-1 break-words text-xl font-semibold sm:text-2xl">{currentModule?.title ?? 'Área administrativa'}</h1>
            </div>
            <Link to="/" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#8B5E7C] px-4 text-sm font-medium text-white">Ver loja</Link>
          </header>
          <p className="mb-5 rounded-2xl border border-[#f1dfe9] bg-[#fef3f8] px-4 py-3 text-xs text-[#5d4454]">{syncStatus}</p>
          {message && <p role="alert" className="mb-5 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900">{message}</p>}
          {currentModule?.id === 'estoque' ? (
            <section className="min-w-0 rounded-3xl border border-[#f1dfe9] bg-white p-3 sm:p-5">
              <p className="mb-4 text-sm text-[#5d4454]">{currentModule.description}</p>
              <ul className="divide-y divide-[#f1dfe9] md:hidden">
                {catalog.map((product) => (
                  <li key={product.id} className="flex min-w-0 items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-[#2d1d25]">{product.name}</p>
                      <p className="mt-1 truncate text-xs text-[#76506a]">SKU: {product.sku ?? '—'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[#f8e9ef] px-3 py-1.5 text-sm font-semibold text-[#76506a]">{product.stock}</span>
                  </li>
                ))}
                {catalog.length === 0 && <li className="py-6 text-center text-sm text-[#5d4454]">Nenhum produto disponível para consulta.</li>}
              </ul>
              <div role="region" aria-label="Estoque por produto" tabIndex={0} className="hidden overflow-x-auto md:block">
                <table className="min-w-[34rem] text-left text-sm">
                  <thead className="text-[#5d4454]"><tr><th className="px-3 py-2">Produto</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Saldo</th></tr></thead>
                  <tbody>
                    {catalog.map((product) => <tr key={product.id} className="border-t border-[#f1dfe9]"><td className="px-3 py-3">{product.name}</td><td className="px-3 py-3">{product.sku ?? '—'}</td><td className="px-3 py-3">{product.stock}</td></tr>)}
                    {catalog.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-[#5d4454]">Nenhum produto disponível para consulta.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 border-t border-[#f1dfe9] pt-5">
                <h2 className="mb-4 text-lg font-semibold">Histórico de movimentações</h2>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <StockMovements />
                </Suspense>
              </div>
            </section>
          ) : currentModule?.id === 'pedidos' ? (
            <section className="min-w-0">
              <Suspense fallback={<RouteLoadingFallback />}>
                <OrdersPage />
              </Suspense>
            </section>
          ) : currentModule?.id === 'categorias' ? (
            <section className="rounded-3xl border border-[#f1dfe9] bg-white p-3 sm:p-5">
              <p className="mb-4 text-sm text-[#5d4454]">{currentModule.description}</p>
              <div className="mb-5 flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder="Nova categoria"
                  className="min-h-11 flex-1 rounded-full border border-[#efd7e7] bg-[#fffafc] px-4 text-sm text-[#2d1d25] outline-none"
                />
                <button
                  type="button"
                  disabled={isSavingCategory || !newCategoryName.trim()}
                  onClick={() => void handleCreateCategory()}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#8B5E7C] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingCategory ? 'Salvando...' : 'Adicionar categoria'}
                </button>
              </div>
              {categoryMessage && <p role="status" className="mb-3 text-sm text-[#5d4454]">{categoryMessage}</p>}
              {categoryError && <p role="alert" className="mb-3 text-sm text-red-700">{categoryError}</p>}
              <ul className="flex flex-wrap gap-2">{categories.map((category) => (
                <li key={category} className="inline-flex items-center gap-2 rounded-full bg-[#f8e9ef] px-3 py-2 text-sm text-[#5d4454]">
                  <span>{category}</span>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCategory(category)}
                    className="text-xs font-medium text-[#8B5E7C]"
                    aria-label={`Remover categoria ${category}`}
                  >
                    Remover
                  </button>
                </li>
              ))}</ul>
            </section>
          ) : currentModule?.id === 'configuracoes' ? (
            <section className="rounded-3xl border border-[#f1dfe9] bg-white p-3 sm:p-7">
              <p className="mb-5 text-sm text-[#5d4454]">{currentModule.description}</p>
              <WhatsAppSettingsForm />
            </section>
          ) : currentModule?.id === 'usuarios' ? (
            <Suspense fallback={<RouteLoadingFallback />}>
              <UserManagement />
            </Suspense>
          ) : (
            <section className="rounded-3xl border border-[#f1dfe9] bg-white p-4 sm:p-8">
              <h2 className="text-lg font-semibold">{currentModule?.title ?? 'Módulo não encontrado'}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5d4454]">
                {currentModule?.description ?? 'A área solicitada não existe.'}
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function ProductCard({ product }: { product: ProductView }) {
  const discountPercentage = product.sale_price_cents !== undefined && product.sale_price_cents < product.price_cents
    ? Math.round((1 - product.sale_price_cents / product.price_cents) * 100)
    : 0;

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-[#e9abc8] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#8B5E7C]/70 hover:shadow-soft sm:rounded-[2rem]">
      <Link to={`/produto/${product.slug}`} className="relative block">
        <img src={product.image} alt={product.name} loading="lazy" decoding="async" className="aspect-square w-full bg-[#fffafc] object-contain sm:aspect-[4/3]" />
        {discountPercentage > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-[#8B5E7C] px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm">
            -{discountPercentage}%
          </span>
        )}
        {product.stock < 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-[#fffafc]/95 px-2.5 py-1 text-[10px] font-semibold text-[#8B5E7C] shadow-sm">
            Esgotado
          </span>
        )}
      </Link>
      <div className="p-2.5 sm:p-4">
        <div className="mb-1.5 flex items-center justify-between sm:mb-2">
          <span className="max-w-full truncate rounded-full bg-[#f8e9ef] px-2 py-1 text-[9px] uppercase tracking-[0.08em] text-[#8B5E7C] sm:text-[10px] sm:tracking-[0.14em]">{product.category}</span>
          {product.sale_price_cents !== undefined && <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#8B5E7C]">Promo</span>}
        </div>
        <Link to={`/produto/${product.slug}`} className="block min-h-[2.5rem] text-sm font-semibold leading-5 text-[#2d1d25] sm:min-h-0 sm:text-lg">{product.name}</Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-1 sm:mt-3 sm:gap-2">
          <span className="text-sm font-semibold text-[#2d1d25] sm:text-lg">{formatCurrency(product.sale_price_cents ?? product.price_cents)}</span>
          {product.sale_price_cents !== undefined ? <span className="text-sm text-[#9c7d8d] line-through">{formatCurrency(product.price_cents)}</span> : null}
        </div>
        <p className={`mt-2 text-xs font-medium ${product.stock > 0 ? 'text-[#6f7b58]' : 'text-[#a15b67]'}`}>
          {product.stock > 0 ? `${product.stock} disponível${product.stock === 1 ? '' : 's'}` : 'Indisponível'}
        </p>
      </div>
    </article>
  );
}

function ProductCardSkeleton() {
  return (
    <article aria-hidden="true" className="overflow-hidden rounded-[2rem] border border-[#f1dfe9] bg-white shadow-sm">
      <div className="aspect-square animate-pulse bg-[#f8e9ef] sm:aspect-[4/3]" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-20 animate-pulse rounded-full bg-[#f8e9ef]" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-[#f8e9ef]" />
        <div className="h-5 w-1/3 animate-pulse rounded bg-[#f8e9ef]" />
      </div>
    </article>
  );
}

function Header() {
  const { totalItems } = useCart();
  const navigate = useNavigate();
  const [headerSearch, setHeaderSearch] = useState('');
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/produtos')) setHeaderSearch('');
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-[#f2dde8] bg-[#fffafc]/90 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3">
          <img
            src={maduLogo}
            alt="Madu Acessórios"
            className="h-12 w-auto object-contain"
          />
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-[#5d4454] md:flex">
          <NavLink to="/" className={({ isActive }) => (isActive ? 'font-semibold text-[#2d1d25]' : '')}>Início</NavLink>
          <NavLink to="/produtos" className={({ isActive }) => (isActive ? 'font-semibold text-[#2d1d25]' : '')}>Produtos</NavLink>
        </nav>

        <form
          className="hidden w-full max-w-xs items-center lg:flex"
          onSubmit={(event) => {
            event.preventDefault();
            const query = headerSearch.trim();
            navigate(query ? `/produtos?q=${encodeURIComponent(query)}` : '/produtos');
          }}
        >
          <label className="relative w-full">
            <span className="sr-only">Pesquisar produtos</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8B5E7C]" size={16} />
            <input
              value={headerSearch}
              onChange={(event) => setHeaderSearch(event.target.value)}
              placeholder="O que você procura?"
              className="w-full rounded-full border border-[#efd7e7] bg-white py-2.5 pl-9 pr-4 text-sm text-[#3d2b35]"
            />
          </label>
        </form>

        <div className="flex items-center gap-2">
          <PwaInstallButton />
          <Link to="/produtos" aria-label="Pesquisar produtos" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#efd7e7] bg-white p-2.5 text-[#8B5E7C]">
            <Search size={18} />
          </Link>
          <Link to="/carrinho" aria-label={`Carrinho${totalItems > 0 ? `, ${totalItems} itens` : ''}`} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#efd7e7] bg-white p-2.5 text-[#8B5E7C]">
            <ShoppingBag size={18} />
            {totalItems > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#8B5E7C] px-1 text-[10px] font-semibold text-white">{totalItems}</span>}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const { whatsappNumber } = useStoreSettings();

  return (
    <footer className="border-t border-[#f2dde8] bg-[#fffafc]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-[#5d4454] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>© 2026 Madu Acessórios</p>
        <div className="flex gap-4">
          <span>Instagram</span>
          {whatsappNumber ? (
            <a href={buildWhatsAppUrl(whatsappNumber, 'Olá! Vim pelo site da MADU.')} target="_blank" rel="noreferrer" className="hover:text-[#8B5E7C]">
              WhatsApp
            </a>
          ) : (
            <span aria-label="WhatsApp não configurado">WhatsApp</span>
          )}
          <span>Política</span>
        </div>
        <Link
          to="/admin/login"
          aria-label="Área administrativa"
          title="Área administrativa"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-full border border-[#efd7e7] px-4 text-xs text-[#8B5E7C] transition hover:bg-[#f8e9ef] sm:self-auto"
        >
          <Settings size={15} aria-hidden="true" />
          Área administrativa
        </Link>
      </div>
    </footer>
  );
}

export default App;
