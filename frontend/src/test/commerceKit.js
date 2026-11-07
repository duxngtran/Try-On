import { USER, makeCart, ok } from './renderApp.jsx';

export const FP1 = 'a'.repeat(32);
export const FP2 = 'b'.repeat(32);

/** Một `CartItem` (api.md 7.2) với giá và thành tiền khớp nhau, trừ khi truyền đè. */
export const line = (n, quantity = 1, extra = {}) => ({
  productId: `p${n}`,
  name: `Áo ${n}`,
  category: { id: 'c1', name: 'Áo thun' },
  image: { url: `https://storage.test/p${n}.jpg`, version: 1 },
  quantity,
  priceVnd: 100000 + n * 1000,
  lineTotalVnd: (100000 + n * 1000) * quantity,
  priceChangedFrom: null,
  available: true,
  ...extra,
});

export const goneLine = (n, quantity = 1) =>
  line(n, quantity, { priceVnd: null, lineTotalVnd: 0, available: false });

/** Giỏ có `fingerprint` chỉ định. Tổng tiền tính từ dòng, trừ khi truyền đè (để chứng minh FE không tự tính). */
export const cartOf = (items, overrides = {}) =>
  makeCart(items, { fingerprint: items.length ? FP1 : null, ...overrides });

export const baseRoutes = (extra = {}) => ({
  'GET /auth/me': ok({ user: USER }),
  ...extra,
});

export const RECIPIENT = {
  name: 'Nguyễn Văn A',
  phone: '0912345678',
  address: '12 Lê Lợi, Quận 1, TP. HCM',
};

export const orderOf = (overrides = {}) => ({
  id: 'o1',
  code: 'DH000123',
  createdAt: '2026-11-06T02:00:00.000Z',
  itemCount: 3,
  totalVnd: 848000,
  recipient: { ...RECIPIENT },
  items: [
    {
      productId: 'p1',
      name: 'Áo A',
      unitPriceVnd: 199000,
      quantity: 2,
      lineTotalVnd: 398000,
      image: { url: 'https://storage.test/p1.jpg', version: 1 },
      stillOnSale: true,
    },
    {
      productId: 'p2',
      name: 'Áo B',
      unitPriceVnd: 450000,
      quantity: 1,
      lineTotalVnd: 450000,
      image: { url: 'https://storage.test/p2.jpg', version: 1 },
      stillOnSale: false,
    },
  ],
  ...overrides,
});

/** Từ ngữ bị cấm trong luồng mua hàng (D-138, D-153, D-161). */
export const BANNED_WORDS =
  /thành công|đã thanh toán|thanh toán khi nhận|đang xử lý|đang giao|hủy đơn|xác nhận size|\bCOD\b/i;
