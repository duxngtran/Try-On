import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { TOKEN_KEY } from '../../services/tokenStorage.js';
import { ADMIN, USER, fail, ok, renderApp } from '../../test/renderApp.jsx';
import { TRYON_PROVIDER } from './tryonConfig.js';

const h1 = (name) => screen.findByRole('heading', { level: 1, name });

const makeState = (overrides = {}) => ({
  profile: { completed: true, missing: [] },
  consent: {
    accepted: true,
    acceptedAt: '2026-11-06T02:00:00.000Z',
    version: 1,
    requiredVersion: 1,
    withdrawnAt: null,
  },
  quota: {
    dailyLimit: 20,
    dailyUsed: 3,
    dailyResetsAt: '2026-11-06T17:00:00.000Z',
    monthlyLimit: 100,
    monthlyUsed: 12,
    monthlyResetsAt: '2026-11-30T17:00:00.000Z',
    held: 0,
    remaining: 16,
  },
  generation: { available: true, prefetchAllowed: true },
  ...overrides,
});
const noConsent = (extra = {}) => ({
  accepted: false,
  acceptedAt: null,
  version: null,
  requiredVersion: 1,
  withdrawnAt: null,
  ...extra,
});

const CATEGORIES = [
  { id: 'c1', name: 'Áo thun', productCount: 12 },
  { id: 'c2', name: 'Váy', productCount: 3 },
];
const PRODUCT = {
  id: 'p1',
  name: 'Áo thun trắng',
  priceVnd: 199000,
  category: { id: 'c1', name: 'Áo thun' },
  image: { url: 'https://storage.test/p1.jpg', version: 1 },
  position: 1,
};
const IMAGE = {
  url: 'https://storage.test/tryon.jpg?token=x',
  expiresAt: '2099-01-01T00:00:00.000Z',
  width: 864,
  height: 1296,
};
const page = (items = [PRODUCT]) =>
  ok({ items, total: items.length, prevCursor: null, nextCursor: null });

const renderRoom = (routes = {}, path = '/try-on') =>
  renderApp(path, {
    token: 'jwt',
    routes: {
      'GET /auth/me': ok({ user: USER }),
      'GET /try-on/state': ok(makeState()),
      'GET /try-on/categories': ok({ categories: CATEGORIES }),
      ...routes,
    },
  });
const callsTo = (calls, key) => calls.filter((c) => c.key === key);

describe('/try-on: quyền truy cập (US-05 E1, E4)', () => {
  it('khách vào /try-on thì sang /login và nhớ để quay lại', async () => {
    const { router } = renderApp('/try-on');
    await h1('Chào mừng trở lại');
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state.from).toBe('/try-on');
  });

  it('admin vào /try-on bị chuyển về /admin, không thấy 403, không gọi API try-on (D-38)', async () => {
    const { calls } = renderApp('/try-on', {
      token: 'jwt',
      routes: { 'GET /auth/me': ok({ user: ADMIN }), 'GET /admin/ping': ok({ ok: true }) },
    });
    await h1('Khu vực quản trị');
    expect(calls.some((c) => c.key.includes('/try-on'))).toBe(false);
  });

  it('liên kết "Thử đồ" ở header chỉ có với người mua', async () => {
    renderRoom();
    await h1('Phòng thử đồ');
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(within(nav).getByRole('link', { name: 'Thử đồ' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('cổng hồ sơ G1 (AC-01)', () => {
  it('hồ sơ chưa đủ: liệt kê phần thiếu, nêu số đo chưa ảnh hưởng ảnh, không gọi /categories', async () => {
    const { calls } = renderRoom({
      'GET /try-on/state': ok(
        makeState({ profile: { completed: false, missing: ['photo', 'measurements'] } }),
      ),
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Hoàn thiện hồ sơ để bắt đầu thử đồ' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ảnh toàn thân' })).toHaveAttribute(
      'href',
      '/profile#photo',
    );
    expect(screen.getByRole('link', { name: 'Chiều cao và cân nặng' })).toHaveAttribute(
      'href',
      '/profile#measurements',
    );
    expect(
      screen.getByText(/Số đo chưa ảnh hưởng đến ảnh thử đồ và không được gửi tới dịch vụ AI/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đến Hồ sơ' })).toHaveAttribute(
      'href',
      '/profile#photo',
    );
    expect(calls.some((c) => c.key === 'GET /try-on/categories')).toBe(false);
  });

  it('chỉ thiếu số đo thì không liệt kê ảnh', async () => {
    renderRoom({
      'GET /try-on/state': ok(
        makeState({ profile: { completed: false, missing: ['measurements'] } }),
      ),
    });
    await screen.findByRole('heading', { level: 2, name: /Hoàn thiện hồ sơ/ });
    expect(screen.queryByRole('link', { name: 'Ảnh toàn thân' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đến Hồ sơ' })).toHaveAttribute(
      'href',
      '/profile#measurements',
    );
  });
});

describe('cổng consent G2 (AC-02, D-93, D-111)', () => {
  const consentRoutes = (consent = noConsent(), extra = {}) => ({
    'GET /try-on/state': ok(makeState({ consent })),
    ...extra,
  });

  it('nêu đủ bên nhận, nơi xử lý, thời gian lưu, không thu hồi được; tên bên nhận lấy từ hằng cấu hình', async () => {
    renderRoom(consentRoutes());
    const gate = await screen.findByRole('region', {
      name: 'Cho phép gửi ảnh của bạn tới dịch vụ AI',
    });
    const { name, domain } = TRYON_PROVIDER;
    expect(gate).toHaveTextContent(`${name} (${domain}), nhà cung cấp dịch vụ thử đồ bằng AI`);
    expect(gate).toHaveTextContent('Ảnh có thể được xử lý ở ngoài Việt Nam');
    expect(gate).toHaveTextContent('tối đa 90 ngày kể từ lần bạn xem gần nhất');
    expect(gate).toHaveTextContent(
      `chúng tôi không thể thu hồi hoặc xóa phần đã được xử lý ở phía ${name}`,
    );
    expect(gate).toHaveTextContent('Rút đồng ý chỉ dừng các lần gửi tiếp theo và xóa ảnh thử đồ');
    expect(gate).toHaveTextContent('chúng tôi chưa tự kiểm chứng');
    // Không câu nào ngụ ý ảnh đã gửi có thể thu hồi.
    expect(gate.textContent).not.toMatch(/xóa vĩnh viễn|thu hồi được ảnh/);
  });

  it('ô đồng ý không tích sẵn; nút chính khóa mềm, vẫn focus được và có lý do; không gọi POST', async () => {
    const { user, calls } = renderRoom(consentRoutes());
    const checkbox = await screen.findByRole('checkbox', { name: /Tôi từ đủ 18 tuổi/ });
    expect(checkbox).not.toBeChecked();
    const submit = screen.getByRole('button', { name: 'Đồng ý và tiếp tục' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(submit).not.toBeDisabled();
    expect(submit).toHaveAccessibleDescription('Hãy đánh dấu ô đồng ý ở trên để tiếp tục.');
    await user.click(submit);
    expect(callsTo(calls, 'POST /try-on/consent')).toHaveLength(0);
  });

  it('tích ô không tự ghi nhận: chỉ gửi khi bấm "Đồng ý và tiếp tục" (D-111)', async () => {
    const { user, calls } = renderRoom(
      consentRoutes(noConsent(), {
        'POST /try-on/consent': ok(makeState()),
      }),
    );
    await user.click(await screen.findByRole('checkbox', { name: /Tôi từ đủ 18 tuổi/ }));
    expect(callsTo(calls, 'POST /try-on/consent')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Đồng ý và tiếp tục' }));
    await h1('Phòng thử đồ');
    await screen.findByRole('group', { name: 'Danh mục' });
    expect(callsTo(calls, 'POST /try-on/consent')).toHaveLength(1);
    expect(callsTo(calls, 'POST /try-on/consent')[0].body).toEqual({ accepted: true });
    // Sau khi đồng ý: không tự chọn danh mục, không sinh ảnh (D-72).
    expect(screen.getByText('Chọn một danh mục')).toBeInTheDocument();
    expect(calls.some((c) => c.key.includes('/products'))).toBe(false);
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(screen.getByText('Đã ghi nhận sự đồng ý')).toBeInTheDocument();
  });

  it('lỗi mạng khi ghi nhận: báo lỗi, giữ ô đã tích, nút bật lại', async () => {
    const { user } = renderRoom(
      consentRoutes(noConsent(), { 'POST /try-on/consent': { networkError: true } }),
    );
    await user.click(await screen.findByRole('checkbox', { name: /Tôi từ đủ 18 tuổi/ }));
    await user.click(screen.getByRole('button', { name: 'Đồng ý và tiếp tục' }));
    expect(
      await screen.findByText('Chưa ghi nhận được sự đồng ý của bạn, vui lòng thử lại.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Tôi từ đủ 18 tuổi/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Đồng ý và tiếp tục' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('429: cảnh báo thao tác quá nhanh và khóa nút theo đếm ngược', async () => {
    const { user } = renderRoom(
      consentRoutes(noConsent(), {
        'POST /try-on/consent': fail(429, 'TOO_MANY_REQUESTS', 'x', { retryAfterSeconds: 30 }),
      }),
    );
    await user.click(await screen.findByRole('checkbox', { name: /Tôi từ đủ 18 tuổi/ }));
    await user.click(screen.getByRole('button', { name: 'Đồng ý và tiếp tục' }));
    expect(
      await screen.findByText('Bạn thao tác quá nhanh, vui lòng thử lại sau.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đồng ý và tiếp tục' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('409 PROFILE_INCOMPLETE khi ghi nhận: chuyển sang cổng hồ sơ', async () => {
    const { user } = renderRoom(
      consentRoutes(noConsent(), {
        'POST /try-on/consent': fail(409, 'PROFILE_INCOMPLETE', 'x', { missing: ['photo'] }),
      }),
    );
    await user.click(await screen.findByRole('checkbox', { name: /Tôi từ đủ 18 tuổi/ }));
    await user.click(screen.getByRole('button', { name: 'Đồng ý và tiếp tục' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Hoàn thiện hồ sơ để bắt đầu thử đồ' }),
    ).toBeInTheDocument();
  });

  it.each([
    [
      'đã rút',
      noConsent({
        withdrawnAt: '2026-11-05T02:00:00.000Z',
        acceptedAt: '2026-11-04T02:00:00.000Z',
      }),
      'Bạn đã rút đồng ý trước đó và các ảnh thử đồ cũ đã được xóa.',
    ],
    [
      'bản cũ',
      noConsent({ acceptedAt: '2026-11-04T02:00:00.000Z', version: 0 }),
      'Điều khoản gửi ảnh đã được cập nhật.',
    ],
  ])('câu mở đầu khi consent %s', async (_label, consent, text) => {
    renderRoom(consentRoutes(consent));
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
  });

  it('"Để sau" về trang chủ', async () => {
    const { user, router } = renderRoom(consentRoutes());
    await user.click(await screen.findByRole('link', { name: 'Để sau' }));
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('phòng thử đồ (AC-03 → AC-07 phía giao diện)', () => {
  it('không tự chọn danh mục, không có chip nào pressed, không gọi sản phẩm hay ảnh (D-72)', async () => {
    const { calls } = renderRoom();
    const group = await screen.findByRole('group', { name: 'Danh mục' });
    const chips = within(group).getAllByRole('button');
    expect(chips).toHaveLength(2);
    chips.forEach((chip) => expect(chip).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByText('Chọn một danh mục')).toBeInTheDocument();
    expect(calls.map((c) => c.key)).not.toContain('GET /try-on/categories/c1/products');
    expect(screen.getByRole('button', { name: 'Áo thun, 12 sản phẩm' })).toBeInTheDocument();
  });

  it('chọn danh mục: sản phẩm đầu hiện ngay với ảnh trải phẳng; ảnh đã có hiện kèm nhãn AI, không POST (AC-04)', async () => {
    const { user, calls, router } = renderRoom({
      'GET /try-on/categories/c1/products': page(),
      'GET /try-on/products/p1/result': ok({ state: 'ready', image: IMAGE }),
    });
    await user.click(await screen.findByRole('button', { name: 'Áo thun, 12 sản phẩm' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Áo thun trắng' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/199\.000/)).toBeInTheDocument();
    expect(await screen.findByAltText('Ảnh bạn mặc Áo thun trắng, do AI tạo')).toBeInTheDocument();
    expect(
      screen.getByText('Ảnh do AI tạo, chỉ để tham khảo, không thể hiện độ vừa vặn'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Áo thun, 12 sản phẩm' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(callsTo(calls, 'POST /try-on/products/p1/jobs')).toHaveLength(0);
    // D-117: đổi danh mục thay thế mục lịch sử, URL chỉ chứa id.
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.search).toBe('?category=c1&product=p1');
  });

  it('ảnh chưa có: hiện chờ ngay với ảnh trải phẳng + nhãn "Ảnh sản phẩm", rồi POST sau 400 ms (AC-03)', async () => {
    const { user, calls } = renderRoom({
      'GET /try-on/categories/c1/products': page(),
      'GET /try-on/products/p1/result': ok({ state: 'none' }),
      'POST /try-on/products/p1/jobs': ok({ state: 'ready', image: IMAGE }),
    });
    await user.click(await screen.findByRole('button', { name: 'Áo thun, 12 sản phẩm' }));
    expect(await screen.findByText('Đang tạo ảnh bạn mặc sản phẩm này…')).toBeInTheDocument();
    expect(screen.getByAltText('Ảnh sản phẩm Áo thun trắng, trải phẳng')).toBeInTheDocument();
    expect(screen.getByText('Ảnh sản phẩm', { selector: 'span' })).toBeInTheDocument();
    expect(callsTo(calls, 'POST /try-on/products/p1/jobs')).toHaveLength(0);
    expect(await screen.findByAltText('Ảnh bạn mặc Áo thun trắng, do AI tạo')).toBeInTheDocument();
    expect(callsTo(calls, 'POST /try-on/products/p1/jobs')).toHaveLength(1);
    expect(callsTo(calls, 'POST /try-on/products/p1/jobs')[0].body).toEqual({ purpose: 'display' });
  });

  it('mở bằng URL có category: tải ngay sản phẩm đầu (ngoại lệ có chủ đích của D-72)', async () => {
    const { calls } = renderRoom(
      {
        'GET /try-on/categories/c2/products': page([{ ...PRODUCT, id: 'p9', name: 'Váy hoa' }]),
        'GET /try-on/products/p9/result': ok({ state: 'blocked', errorCode: 'TRYON_BLOCKED' }),
      },
      '/try-on?category=c2',
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Váy hoa' })).toBeInTheDocument();
    expect(
      await screen.findByText('Không thể tạo ảnh thử đồ với sản phẩm này.'),
    ).toBeInTheDocument();
    // S7 không có Thử lại và không POST (R9).
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  it('S7/S8/S6 trên sân khấu: câu chữ theo mã, nút đúng, ảnh trải phẳng giữ nguyên', async () => {
    renderRoom(
      {
        'GET /try-on/categories/c1/products': page(),
        'GET /try-on/products/p1/result': ok({
          state: 'blocked',
          errorCode: 'TRYON_PHOTO_UNUSABLE',
        }),
      },
      '/try-on?category=c1',
    );
    expect(
      await screen.findByText(
        'Ảnh của bạn chưa phù hợp để thử đồ. Hãy dùng ảnh đứng thẳng, thấy toàn thân.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đổi ảnh hồ sơ' })).toHaveAttribute(
      'href',
      '/profile#photo',
    );
    expect(screen.getByAltText('Ảnh sản phẩm Áo thun trắng, trải phẳng')).toBeInTheDocument();
  });

  it('lỗi tạo ảnh: câu chữ cố định, không hiển thị message của server (D-119); Thử lại gọi POST', async () => {
    let posts = 0;
    const { user } = renderRoom(
      {
        'GET /try-on/categories/c1/products': page(),
        'GET /try-on/products/p1/result': ok({ state: 'none' }),
        'POST /try-on/products/p1/jobs': () => {
          posts += 1;
          return posts === 1
            ? fail(500, 'INTERNAL_ERROR', 'Lỗi DB nội bộ: relation tryon_jobs')
            : ok({ state: 'ready', image: IMAGE });
        },
      },
      '/try-on?category=c1',
    );
    expect(await screen.findByText('Chưa tạo được ảnh, vui lòng thử lại.')).toBeInTheDocument();
    expect(screen.queryByText(/relation|DB nội bộ/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByAltText('Ảnh bạn mặc Áo thun trắng, do AI tạo')).toBeInTheDocument();
    expect(posts).toBe(2);
  });

  it('E6: danh mục trống giữa chừng hiện trạng thái rỗng, làm mới danh mục, bỏ chọn khi nó biến mất', async () => {
    let categoryCalls = 0;
    const { user, router } = renderRoom({
      'GET /try-on/categories': () => {
        categoryCalls += 1;
        return ok({ categories: categoryCalls === 1 ? CATEGORIES : [CATEGORIES[1]] });
      },
      'GET /try-on/categories/c1/products': page([]),
    });
    await user.click(await screen.findByRole('button', { name: 'Áo thun, 12 sản phẩm' }));
    expect(await screen.findByText('Danh mục này chưa có sản phẩm.')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Áo thun, 12 sản phẩm' }),
      ).not.toBeInTheDocument(),
    );
    expect(router.state.location.search).toBe('');
    expect(screen.getByText('Danh mục này chưa có sản phẩm.')).toBeInTheDocument();
    expect(screen.getByText('Hãy chọn danh mục khác.')).toBeInTheDocument();
  });

  it('E7: danh mục không còn tồn tại (404) thì báo và tải lại danh sách danh mục', async () => {
    let categoryCalls = 0;
    renderRoom(
      {
        'GET /try-on/categories': () => {
          categoryCalls += 1;
          return ok({ categories: categoryCalls === 1 ? CATEGORIES : [CATEGORIES[1]] });
        },
        'GET /try-on/categories/c1/products': fail(404, 'NOT_FOUND'),
      },
      '/try-on?category=c1',
    );
    expect(await screen.findByText('Danh mục không còn tồn tại.')).toBeInTheDocument();
    await waitFor(() => expect(categoryCalls).toBe(2));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Áo thun, 12 sản phẩm' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('lưới của phòng là một cột co được (grid-cols-1), nếu không hàng chip cuộn ngang làm trang tràn ngang ở 360 px', async () => {
    renderRoom();
    const chips = await screen.findByRole('group', { name: 'Danh mục' });
    const grid = chips.closest('.grid');
    // jsdom không có bố cục: giữ lại lớp CSS đã được kiểm bằng trình duyệt thật (T-81: dư 1039 px khi thiếu lớp này).
    expect(grid).toHaveClass('grid-cols-1');
    expect(chips.closest('.min-w-0')).not.toBeNull();
  });

  it('G3: không có danh mục nào thì hiện cửa hàng trống, không sinh ảnh (E5)', async () => {
    renderRoom({ 'GET /try-on/categories': ok({ categories: [] }) });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Cửa hàng chưa có sản phẩm để thử.' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Danh mục' })).not.toBeInTheDocument();
  });

  it('lỗi tải /state: Error state kèm Thử lại', async () => {
    let calls = 0;
    const { user } = renderRoom({
      'GET /try-on/state': () => {
        calls += 1;
        return calls === 1 ? fail(500, 'INTERNAL_ERROR') : ok(makeState());
      },
    });
    expect(
      await screen.findByText('Không thể tải phòng thử đồ. Vui lòng kiểm tra mạng và thử lại.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('group', { name: 'Danh mục' })).toBeInTheDocument();
  });

  it('403 giữa chừng gỡ sân khấu và hiện cổng consent kèm câu "đã thay đổi" (S16, E9)', async () => {
    let stateCalls = 0;
    renderRoom(
      {
        'GET /try-on/state': () => {
          stateCalls += 1;
          return ok(
            makeState(stateCalls === 1 ? {} : { consent: noConsent({ withdrawnAt: 'x' }) }),
          );
        },
        'GET /try-on/categories/c1/products': page(),
        'GET /try-on/products/p1/result': fail(403, 'TRYON_CONSENT_REQUIRED'),
      },
      '/try-on?category=c1',
    );
    expect(
      await screen.findByText(
        'Đồng ý gửi ảnh của bạn không còn hiệu lực, nên ảnh thử đồ đã được gỡ khỏi màn hình.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByAltText(/Ảnh sản phẩm Áo thun trắng/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Cho phép gửi ảnh/ })).toHaveFocus();
  });

  it('409 giữa chừng: cổng hồ sơ kèm câu "đã thay đổi", liệt kê theo details.missing', async () => {
    renderRoom(
      {
        'GET /try-on/categories/c1/products': page(),
        'GET /try-on/products/p1/result': fail(409, 'PROFILE_INCOMPLETE', 'x', {
          missing: ['photo'],
        }),
      },
      '/try-on?category=c1',
    );
    expect(
      await screen.findByText(
        'Hồ sơ của bạn vừa thay đổi, phần ảnh thử đồ đã được gỡ khỏi màn hình.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ảnh toàn thân' })).toBeInTheDocument();
  });

  it('dải thông báo phòng: tạm dừng, hết lượt kèm mốc 00:00 theo giờ Việt Nam; còn lượt giữ cho job đang chạy thì không báo', async () => {
    const exhausted = makeState({
      generation: { available: false, prefetchAllowed: false },
      quota: { ...makeState().quota, remaining: 0, held: 0, dailyUsed: 20 },
    });
    const first = renderRoom({ 'GET /try-on/state': ok(exhausted) });
    expect(
      await screen.findByText('Tính năng tạo ảnh đang tạm dừng. Bạn vẫn xem được các ảnh đã tạo.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Bạn đã dùng hết lượt tạo ảnh. Lượt mới có sau 00:00 ngày 07/11. Các ảnh đã tạo vẫn xem được.',
      ),
    ).toBeInTheDocument();
    first.unmount();

    renderRoom({
      'GET /try-on/state': ok(
        makeState({ quota: { ...makeState().quota, remaining: 0, held: 1, dailyUsed: 19 } }),
      ),
    });
    await screen.findByRole('group', { name: 'Danh mục' });
    expect(screen.queryByText(/Bạn đã dùng hết lượt tạo ảnh/)).not.toBeInTheDocument();
  });

  it('còn ≤ 5 lượt thì báo số lượt và nói ảnh tạo sẵn cũng được tính; nhiều hơn thì không báo (D-120)', async () => {
    const low = makeState({ quota: { ...makeState().quota, remaining: 4 } });
    const first = renderRoom(
      {
        'GET /try-on/state': ok(low),
        'GET /try-on/categories/c1/products': page(),
        'GET /try-on/products/p1/result': ok({ state: 'ready', image: IMAGE }),
      },
      '/try-on?category=c1',
    );
    expect(await screen.findByText('Bạn còn 4 lượt tạo ảnh hôm nay.')).toBeInTheDocument();
    expect(
      screen.getByText('Ảnh tạo sẵn cho sản phẩm kế tiếp cũng được tính vào lượt.'),
    ).toBeInTheDocument();
    first.unmount();

    renderRoom(
      {
        'GET /try-on/categories/c1/products': page(),
        'GET /try-on/products/p1/result': ok({ state: 'ready', image: IMAGE }),
      },
      '/try-on?category=c1',
    );
    await screen.findByAltText('Ảnh bạn mặc Áo thun trắng, do AI tạo');
    expect(screen.queryByText(/Bạn còn \d+ lượt/)).not.toBeInTheDocument();
  });

  it('không lưu ảnh, URL ảnh hay số đo vào localStorage; URL chỉ chứa id', async () => {
    const { user, router } = renderRoom({
      'GET /try-on/categories/c1/products': page(),
      'GET /try-on/products/p1/result': ok({ state: 'ready', image: IMAGE }),
    });
    await user.click(await screen.findByRole('button', { name: 'Áo thun, 12 sản phẩm' }));
    await screen.findByAltText('Ảnh bạn mặc Áo thun trắng, do AI tạo');
    expect(Object.keys(localStorage)).toEqual([TOKEN_KEY]);
    expect(sessionStorage.length).toBe(0);
    expect(router.state.location.search).not.toMatch(/http|token/);
    expect(screen.getByAltText('Ảnh bạn mặc Áo thun trắng, do AI tạo')).toHaveAttribute(
      'draggable',
      'false',
    );
  });

  it('đổi danh mục giữa chừng: sân khấu sang danh mục mới ngay, kết quả muộn của sản phẩm cũ không đổi ảnh', async () => {
    let releaseOld;
    const { user } = renderRoom({
      'GET /try-on/categories/c1/products': page(),
      'GET /try-on/categories/c2/products': page([{ ...PRODUCT, id: 'p2', name: 'Váy hoa' }]),
      'GET /try-on/products/p1/result': ok({
        state: 'pending',
        job: { id: 'j1', status: 'running' },
      }),
      'GET /try-on/jobs/j1': () =>
        new Promise((resolve) => {
          releaseOld = resolve;
        }),
      'GET /try-on/products/p2/result': ok({ state: 'blocked', errorCode: 'TRYON_BLOCKED' }),
    });
    await user.click(await screen.findByRole('button', { name: 'Áo thun, 12 sản phẩm' }));
    expect(await screen.findByText('Đang tạo ảnh bạn mặc sản phẩm này…')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Váy, 3 sản phẩm' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Váy hoa' })).toBeInTheDocument();
    expect(
      await screen.findByText('Không thể tạo ảnh thử đồ với sản phẩm này.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Đang tạo ảnh bạn mặc sản phẩm này…')).not.toBeInTheDocument();
    expect(releaseOld ?? null).toBeNull(); // poll của sản phẩm cũ chưa kịp chạy vì đã rời đi
  });
});
