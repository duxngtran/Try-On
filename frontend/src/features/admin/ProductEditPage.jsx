import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { ProductForm } from './ProductForm.jsx';
import { PRODUCT_GONE_MESSAGE } from './productErrors.js';
import { productsApi } from './productsApi.js';

const LIST = '/admin/products';

function EditSkeleton() {
  const bar = 'animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none';
  return (
    <div
      aria-busy="true"
      className="mt-6 grid gap-8 rounded-lg border border-line bg-surface p-4 md:p-6 lg:grid-cols-[20rem_1fr]"
    >
      <span role="status" className="sr-only">
        Đang tải sản phẩm
      </span>
      <div className={`aspect-square w-full max-w-xs ${bar}`} />
      <div className="max-w-md space-y-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-12 ${bar}`} />
        ))}
        <div className={`h-12 w-32 ${bar}`} />
      </div>
    </div>
  );
}

/** `/admin/products/:id/edit`: tải sản phẩm rồi dựng form (screens/product-form.md, mục "Chế độ sửa"). */
export function ProductEditPage() {
  usePageTitle('Sửa sản phẩm');
  const { id } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const from = state?.from ?? '';
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ attempt: -1, product: null, failed: false });

  useEffect(() => {
    const controller = new AbortController();
    productsApi
      .get(id, { signal: controller.signal })
      .then((product) => setResult({ attempt, product, failed: false }))
      .catch((error) => {
        if (error?.code === 'CANCELED') return;
        if (error?.code === 'NOT_FOUND') {
          navigate(LIST, {
            replace: true,
            state: { notice: { message: PRODUCT_GONE_MESSAGE, variant: 'error' } },
          });
          return;
        }
        setResult({ attempt, product: null, failed: true });
      });
    return () => controller.abort();
  }, [id, attempt, navigate]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const settled = result.attempt === attempt;

  if (settled && result.product && result.product.id.toLowerCase() === id.toLowerCase()) {
    return (
      <ProductForm
        key={result.product.id}
        mode="edit"
        product={result.product}
        backTo={`${LIST}${from}`}
        successTo={`${LIST}${from}`}
      />
    );
  }

  return (
    <section>
      <Link
        to={`${LIST}${from}`}
        className="inline-flex h-11 items-center gap-2 text-small font-semibold text-accent-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Sản phẩm
      </Link>
      <h1 className="mt-1 font-display text-title font-semibold md:text-display">Sửa sản phẩm</h1>
      {settled && result.failed ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-4 py-12 text-center">
          <WifiOff size={40} aria-hidden="true" className="text-ink-subtle" />
          <p role="alert">Không thể tải sản phẩm. Vui lòng kiểm tra mạng và thử lại.</p>
          <Button variant="secondary" onClick={retry}>
            Thử lại
          </Button>
        </div>
      ) : (
        <EditSkeleton />
      )}
    </section>
  );
}
