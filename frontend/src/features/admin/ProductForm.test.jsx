import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { ADMIN, fail, ok, renderApp } from '../../test/renderApp.jsx';

// jsdom không giải mã ảnh: giả lập loader theo tên file (kích thước nằm trong tên, vd. "400x400.jpg").
vi.mock('../profile/imageLoader.js', () => ({
  loadImage: async (file) => {
    if (file.name.startsWith('broken')) throw new Error('IMAGE_UNREADABLE');
    const [, w, h] = /(\d+)x(\d+)/.exec(file.name);
    return { url: `blob:${file.name}`, width: Number(w), height: Number(h) };
  },
}));

const CATEGORIES = [
  { id: 'c1', name: 'Áo thun', productCount: 1 },
  { id: 'c2', name: 'Váy', productCount: 0 },
];
const PRODUCT = {
  id: 'p1',
  name: 'Áo thun trắng',
  priceVnd: 199000,
  category: { id: 'c1', name: 'Áo thun' },
  image: { url: 'https://img.example/p1.jpg', version: 1 },
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T08:00:00.000Z',
};
const file = (name, size = 1024) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

const base = (routes = {}) => ({
  token: 'jwt',
  routes: {
    'GET /auth/me': ok({ user: ADMIN }),
    'GET /admin/categories': ok({ categories: CATEGORIES }),
    'GET /admin/products': ok({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    }),
    ...routes,
  },
});
const renderNew = (routes) => renderApp('/admin/products/new', base(routes));
const renderEdit = (routes, entry = '/admin/products/p1/edit') =>
  renderApp(entry, base({ 'GET /admin/products/p1': ok({ product: PRODUCT }), ...routes }));

const sent = (calls, key) => calls.filter((c) => c.key === key).at(-1)?.body;
const keysOf = (form) => [...form.keys()].sort();

beforeEach(() => {
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

async function fillNew(
  user,
  { name = 'Áo thun trắng', price = '199.000', image = '800x800.jpg' } = {},
) {
  await screen.findByRole('option', { name: 'Áo thun' });
  await user.type(screen.getByLabelText('Tên sản phẩm'), name);
  await user.type(screen.getByLabelText('Giá'), price);
  await user.selectOptions(screen.getByLabelText('Danh mục'), 'c1');
  if (image) await user.upload(document.querySelector('input[type="file"]'), file(image));
}

describe('thêm sản phẩm (AC-01, AC-03, AC-04)', () => {
  it('giá 199.5 bị chặn ở FE và không gọi API; sửa lại thành 199.000 thì gửi chuỗi chữ số thuần, về danh sách kèm toast', async () => {
    const { user, calls, router } = renderNew({
      'POST /admin/products': () => ok({ product: PRODUCT }, 201),
    });
    await fillNew(user, { price: '199.5' });
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(
      await screen.findByText('Giá phải là số nguyên từ 1.000 đến 100.000.000 đồng.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Giá')).toHaveFocus();
    expect(calls.some((c) => c.key === 'POST /admin/products')).toBe(false);

    await user.clear(screen.getByLabelText('Giá'));
    await user.type(screen.getByLabelText('Giá'), '199.000');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Đã thêm sản phẩm')).toBeInTheDocument();

    const form = sent(calls, 'POST /admin/products');
    expect(form.get('priceVnd')).toBe('199000');
    expect(form.get('name')).toBe('Áo thun trắng');
    expect(form.get('categoryId')).toBe('c1');
    expect(form.get('image').name).toBe('800x800.jpg');
    expect(router.state.location.pathname).toBe('/admin/products');
    // Không bị hỏi "Rời khỏi trang?" sau khi lưu thành công.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ảnh sai quy tắc bị chặn ngay (không xem trước, không gọi API); thiếu ảnh khi lưu báo lỗi', async () => {
    const { user, calls } = renderNew();
    await fillNew(user, { image: null });
    const input = document.querySelector('input[type="file"]');

    await user.upload(input, file('400x400.jpg'));
    expect(await screen.findByText('Ảnh sản phẩm cần tối thiểu 512 × 512 px.')).toBeInTheDocument();
    expect(screen.queryByAltText('Xem trước ảnh sản phẩm')).not.toBeInTheDocument();

    await user.upload(input, file('600x2000.jpg'));
    expect(
      await screen.findByText('Ảnh quá dài hoặc quá hẹp, cạnh dài tối đa gấp 3 lần cạnh ngắn.'),
    ).toBeInTheDocument();
    await user.upload(input, file('broken-100x100.jpg'));
    expect(
      await screen.findByText('Không đọc được ảnh, vui lòng chọn ảnh khác.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Vui lòng chọn ảnh sản phẩm.')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'POST /admin/products')).toBe(false);

    // Ảnh hợp lệ -> có xem trước, lỗi biến mất; ảnh sai chọn sau đó không thay ảnh đang có.
    await user.upload(input, file('512x1536.jpg'));
    expect(await screen.findByAltText('Xem trước ảnh sản phẩm')).toBeInTheDocument();
    expect(screen.queryByText('Vui lòng chọn ảnh sản phẩm.')).not.toBeInTheDocument();
    await user.upload(input, file('400x400.jpg'));
    expect(await screen.findByText('Ảnh sản phẩm cần tối thiểu 512 × 512 px.')).toBeInTheDocument();
    expect(screen.getByAltText('Xem trước ảnh sản phẩm')).toHaveAttribute(
      'src',
      'blob:512x1536.jpg',
    );
  });

  it('chưa có danh mục: báo "Cần tạo danh mục trước." kèm liên kết, khóa nút Lưu (E18)', async () => {
    renderNew({ 'GET /admin/categories': ok({ categories: [] }) });
    expect(await screen.findByText(/Cần tạo danh mục trước/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo danh mục' })).toHaveAttribute(
      'href',
      '/admin/categories',
    );
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });

  it('CATEGORY_NOT_FOUND: lỗi dưới ô danh mục, bỏ chọn, tải lại danh mục, giữ tên/giá/ảnh', async () => {
    let categoryCalls = 0;
    const { user } = renderNew({
      'GET /admin/categories': () => {
        categoryCalls += 1;
        return ok({ categories: categoryCalls === 1 ? CATEGORIES : [CATEGORIES[1]] });
      },
      'POST /admin/products': fail(400, 'CATEGORY_NOT_FOUND'),
    });
    await fillNew(user);
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(
      await screen.findByText('Danh mục không còn tồn tại, vui lòng chọn danh mục khác.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(categoryCalls).toBe(2));
    expect(screen.getByLabelText('Danh mục')).toHaveValue('');
    expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Áo thun trắng');
    expect(screen.getByLabelText('Giá')).toHaveValue('199.000');
    expect(screen.getByAltText('Xem trước ảnh sản phẩm')).toBeInTheDocument();
  });

  it('mất mạng: giữ nguyên form và ảnh xem trước, nút Lưu dùng lại được (E17)', async () => {
    const { user } = renderNew({ 'POST /admin/products': { networkError: true } });
    await fillNew(user);
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Mất kết nối, vui lòng thử lại.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Áo thun trắng');
    expect(screen.getByAltText('Xem trước ảnh sản phẩm')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled();
  });

  it('500 khi có ảnh: báo "Tải ảnh thất bại"; lỗi ảnh từ server gắn vào khung ảnh', async () => {
    let attempts = 0;
    const { user } = renderNew({
      'POST /admin/products': () =>
        (attempts += 1) === 1 ? fail(500, 'INTERNAL_ERROR') : fail(400, 'INVALID_IMAGE'),
    });
    await fillNew(user);
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Tải ảnh thất bại, vui lòng thử lại.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(
      await screen.findByText('Không đọc được ảnh, vui lòng chọn ảnh khác.'),
    ).toBeInTheDocument();
  });

  it('429: cảnh báo kèm đếm ngược mm:ss, khóa Lưu; thiếu retryAfterSeconds thì chỉ câu tĩnh (D-34)', async () => {
    const { user } = renderNew({
      'POST /admin/products': fail(429, 'TOO_MANY_REQUESTS', 'x', { retryAfterSeconds: 754 }),
    });
    await fillNew(user);
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(
      await screen.findByText('Bạn thao tác quá nhanh, vui lòng thử lại sau.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Thử lại sau 12:34')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });

  it('VALIDATION_ERROR có details: lỗi gắn đúng ô', async () => {
    const { user } = renderNew({
      'POST /admin/products': fail(400, 'VALIDATION_ERROR', 'x', [
        { field: 'name', message: 'Tên sản phẩm phải từ 2 đến 120 ký tự.' },
      ]),
    });
    await fillNew(user);
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Tên sản phẩm phải từ 2 đến 120 ký tự.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên sản phẩm')).toHaveFocus();
  });
});

describe('cảnh báo rời form chưa lưu (D-60)', () => {
  it('có chữ trong form: bấm AdminNav hiện hộp thoại; "Ở lại" giữ nguyên, "Rời đi" chuyển trang', async () => {
    const { user, router } = renderNew();
    await screen.findByRole('option', { name: 'Áo thun' });
    await user.type(screen.getByLabelText('Tên sản phẩm'), 'Áo');
    const nav = screen.getByRole('navigation', { name: 'Quản trị' });

    await user.click(within(nav).getByRole('link', { name: 'Danh mục' }));
    const box = await screen.findByRole('dialog', { name: 'Rời khỏi trang?' });
    expect(within(box).getByText('Thông tin chưa lưu sẽ mất.')).toBeInTheDocument();
    expect(within(box).getByRole('button', { name: 'Ở lại' })).toHaveFocus();
    await user.click(within(box).getByRole('button', { name: 'Ở lại' }));
    expect(router.state.location.pathname).toBe('/admin/products/new');
    expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Áo');

    await user.click(within(nav).getByRole('link', { name: 'Danh mục' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Rời đi' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/categories'));
  });

  it('nút Back của trình duyệt cũng bị chặn; form chưa động tới thì không hỏi', async () => {
    const { user, router } = renderApp(['/admin/products', '/admin/products/new'], base());
    await router.navigate('/admin/products/new');
    await screen.findByRole('option', { name: 'Áo thun' });
    await user.click(screen.getAllByRole('link', { name: 'Sản phẩm' }).at(-1));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/products'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await router.navigate('/admin/products/new');
    await user.type(await screen.findByLabelText('Tên sản phẩm'), 'x');
    await router.navigate(-1);
    expect(await screen.findByRole('dialog', { name: 'Rời khỏi trang?' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/products/new');
  });
});

describe('sửa sản phẩm (AC-06, AC-07, AC-09, AC-14)', () => {
  const from = { pathname: '/admin/products/p1/edit', state: { from: '?page=2' } };

  it('Lưu tắt khi chưa đổi gì; chỉ đổi giá thì chỉ gửi priceVnd; về danh sách đúng trang kèm toast', async () => {
    const { user, calls, router } = renderEdit(
      { 'PATCH /admin/products/p1': () => ok({ product: { ...PRODUCT, priceVnd: 249000 } }) },
      [from],
    );
    const price = await screen.findByLabelText('Giá');
    expect(price).toHaveValue('199.000');
    expect(screen.getByLabelText('Tên sản phẩm')).toHaveValue('Áo thun trắng');
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
    expect(screen.getByAltText('Áo thun trắng')).toHaveAttribute('src', PRODUCT.image.url);

    await user.clear(price);
    await user.type(price, '249000');
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Đã cập nhật sản phẩm')).toBeInTheDocument();

    const form = sent(calls, 'PATCH /admin/products/p1');
    expect(keysOf(form)).toEqual(['priceVnd']);
    expect(form.get('priceVnd')).toBe('249000');
    expect(router.state.location.pathname).toBe('/admin/products');
    expect(router.state.location.search).toBe('?page=2');
  });

  it('đổi tên và ảnh: gửi name và image, không gửi giá/danh mục; "Giữ ảnh cũ" bỏ ảnh mới', async () => {
    const { user, calls } = renderEdit({
      'PATCH /admin/products/p1': () => ok({ product: PRODUCT }),
    });
    const name = await screen.findByLabelText('Tên sản phẩm');
    await user.clear(name);
    await user.type(name, '  Áo   thun   mới ');
    await user.upload(document.querySelector('input[type="file"]'), file('900x900.jpg'));
    expect(await screen.findByAltText('Xem trước ảnh sản phẩm')).toBeInTheDocument();
    expect(screen.getByText('Ảnh mới')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Giữ ảnh cũ' }));
    expect(screen.queryByAltText('Xem trước ảnh sản phẩm')).not.toBeInTheDocument();
    await user.upload(document.querySelector('input[type="file"]'), file('900x900.jpg'));
    await screen.findByAltText('Xem trước ảnh sản phẩm');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await screen.findByText('Đã cập nhật sản phẩm');

    const form = sent(calls, 'PATCH /admin/products/p1');
    expect(keysOf(form)).toEqual(['image', 'name']);
    expect(form.get('name')).toBe('Áo thun mới');
  });

  it('đổi lại đúng giá trị cũ (khác cách viết) thì không tính là thay đổi', async () => {
    const { user } = renderEdit();
    const price = await screen.findByLabelText('Giá');
    await user.clear(price);
    await user.type(price, '199000');
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });

  it('id không tồn tại (404): về danh sách kèm toast lỗi', async () => {
    const { router } = renderApp('/admin/products/abc/edit', {
      ...base({ 'GET /admin/products/abc': fail(404, 'NOT_FOUND') }),
    });
    expect(await screen.findByText('Sản phẩm không còn tồn tại.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/products');
  });

  it('lưu gặp 404 (bị xóa từ tab khác): về danh sách kèm toast, không hỏi rời trang', async () => {
    const { user, router } = renderEdit({ 'PATCH /admin/products/p1': fail(404, 'NOT_FOUND') });
    const price = await screen.findByLabelText('Giá');
    await user.clear(price);
    await user.type(price, '250000');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Sản phẩm không còn tồn tại.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/products');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lỗi tải sản phẩm: có Thử lại và link quay lại', async () => {
    let attempts = 0;
    const { user } = renderApp(
      '/admin/products/p1/edit',
      base({
        'GET /admin/products/p1': () =>
          (attempts += 1) === 1 ? fail(500, 'INTERNAL_ERROR') : ok({ product: PRODUCT }),
      }),
    );
    expect(await screen.findByText(/Không thể tải sản phẩm/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Sản phẩm' })).toHaveLength(2); // AdminNav + quay lại
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText('Tên sản phẩm')).toHaveValue('Áo thun trắng');
  });
});
