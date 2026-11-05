import { useLocation } from 'react-router';
import { usePageTitle } from '../../hooks/usePageTitle.js';
import { ProductForm } from './ProductForm.jsx';

const LIST = '/admin/products';

/** `/admin/products/new` (screens/product-form.md). Mở từ danh sách đang lọc thì chọn sẵn danh mục đó. */
export function ProductNewPage() {
  usePageTitle('Thêm sản phẩm');
  const { state } = useLocation();
  return (
    <ProductForm
      mode="create"
      backTo={`${LIST}${state?.from ?? ''}`}
      successTo={LIST}
      initialCategoryId={state?.categoryId ?? ''}
    />
  );
}
