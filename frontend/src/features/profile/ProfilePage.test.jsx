import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { USER, fail, ok, renderApp } from '../../test/renderApp.jsx';
import { apiClient } from '../../services/apiClient.js';

// jsdom không tải ảnh thật: giả lập bước đọc kích thước.
vi.mock('./imageLoader.js', () => ({
  loadImage: vi.fn(async () => ({ url: 'blob:preview-1', width: 800, height: 1400 })),
}));

const OLD_URL = 'https://storage.test/old.jpg?token=a';
const NEW_URL = 'https://storage.test/new.jpg?token=b';

const makeProfile = (overrides = {}) => ({
  heightCm: null,
  weightKg: null,
  photo: null,
  consent: { accepted: false, acceptedAt: null, version: 1 },
  profileCompleted: false,
  missing: ['photo', 'measurements'],
  ...overrides,
});
const photo = (url = OLD_URL) => ({
  url,
  expiresAt: '2099-01-01T00:00:00.000Z',
  version: 1,
  updatedAt: '2026-11-04T08:00:00.000Z',
});
const consented = { accepted: true, acceptedAt: '2026-11-04T07:00:00.000Z', version: 1 };

const renderProfile = (routes) =>
  renderApp('/profile', {
    token: 'jwt',
    routes: { 'GET /auth/me': ok({ user: USER }), ...routes },
  });

const file = () => new File(['x'], 'me.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  URL.revokeObjectURL = vi.fn();
});

describe('Trang hồ sơ: số đo (AC-07, AC-08)', () => {
  it('hồ sơ trống: banner liệt kê 2 phần thiếu (AC-01)', async () => {
    renderProfile({ 'GET /profile': ok({ profile: makeProfile() }) });
    expect(await screen.findByText('Đã xong 0/2 bước')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ảnh toàn thân' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chiều cao và cân nặng' })).toBeInTheDocument();
  });

  it('gửi số (52,5 -> 52.5), không gọi API khi một ô sai, và lưu không cần ảnh', async () => {
    const saved = makeProfile({ heightCm: 165, weightKg: 52.5, missing: ['photo'] });
    const { user, calls } = renderProfile({
      'GET /profile': ok({ profile: makeProfile() }),
      'PUT /profile/measurements': ok({ profile: saved }),
    });
    await user.type(await screen.findByLabelText('Chiều cao'), '165');
    await user.type(screen.getByLabelText('Cân nặng'), '52.55');
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    expect(await screen.findByText('Cân nặng phải từ 30 đến 250 kg.')).toBeInTheDocument();
    expect(calls.some((c) => c.key === 'PUT /profile/measurements')).toBe(false);

    await user.clear(screen.getByLabelText('Cân nặng'));
    await user.type(screen.getByLabelText('Cân nặng'), '52,5');
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await screen.findByText(/Đã lưu lúc/);
    expect(calls.find((c) => c.key === 'PUT /profile/measurements').body).toEqual({
      heightCm: 165,
      weightKg: 52.5,
    });
    expect(screen.getByLabelText('Cân nặng')).toHaveValue('52,5');
    expect(screen.getByText('Đã xong 1/2 bước')).toBeInTheDocument();
  });

  it('lỗi 400 từ server hiện dưới đúng ô và giữ dữ liệu đã nhập', async () => {
    const { user } = renderProfile({
      'GET /profile': ok({ profile: makeProfile() }),
      'PUT /profile/measurements': fail(400, 'VALIDATION_ERROR', 'x', [
        { field: 'heightCm', message: 'Chiều cao phải từ 100 đến 250 cm.' },
      ]),
    });
    await user.type(await screen.findByLabelText('Chiều cao'), '170');
    await user.type(screen.getByLabelText('Cân nặng'), '60');
    await user.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    expect(await screen.findByText('Chiều cao phải từ 100 đến 250 cm.')).toBeInTheDocument();
    expect(screen.getByLabelText('Chiều cao')).toHaveValue('170');
  });
});

describe('Trang hồ sơ: consent và ảnh (AC-02, AC-03, AC-05)', () => {
  it('chưa consent thì nút Chọn ảnh bị khóa; tích consent gọi API rồi mở khóa', async () => {
    const { user, calls } = renderProfile({
      'GET /profile': ok({ profile: makeProfile() }),
      'POST /profile/photo-consent': ok({ profile: makeProfile({ consent: consented }) }),
    });
    const choose = await screen.findByRole('button', { name: 'Chọn ảnh' });
    expect(choose).toHaveAttribute('aria-disabled', 'true');
    await user.click(choose);
    expect(screen.queryByRole('button', { name: 'Lưu ảnh' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Tôi đồng ý/ }));
    await screen.findByText('Bạn đã đồng ý sử dụng ảnh');
    expect(calls.find((c) => c.key === 'POST /profile/photo-consent').body).toEqual({
      accepted: true,
    });
    expect(screen.getByRole('button', { name: 'Chọn ảnh' })).not.toHaveAttribute('aria-disabled');
  });

  it('tải lỗi thì giữ ảnh cũ và giữ preview để gửi lại; tải lại thành công thì thay ảnh', async () => {
    const current = makeProfile({
      heightCm: 165,
      weightKg: 52.5,
      photo: photo(),
      consent: consented,
      profileCompleted: true,
      missing: [],
    });
    let attempt = 0;
    const { user } = renderProfile({
      'GET /profile': ok({ profile: current }),
      'PUT /profile/photo': () => {
        attempt += 1;
        return attempt === 1
          ? fail(500, 'UPLOAD_FAILED')
          : ok({ profile: { ...current, photo: photo(NEW_URL) } });
      },
    });
    const stored = await screen.findByAltText('Ảnh toàn thân của bạn');
    expect(stored).toHaveAttribute('src', OLD_URL);

    await user.upload(screen.getByLabelText('Chọn ảnh toàn thân', { selector: 'input' }), file());
    await user.click(await screen.findByRole('button', { name: 'Lưu ảnh' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tải ảnh thất bại, vui lòng thử lại.');
    expect(screen.getByAltText('Ảnh bạn vừa chọn, chưa lưu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu ảnh' })).toBeEnabled();
    // Ảnh đã lưu không đổi trên server; trang vẫn nhớ URL cũ.
    expect(screen.queryByRole('button', { name: 'Thay ảnh' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lưu ảnh' }));
    await waitFor(() =>
      expect(screen.getByAltText('Ảnh toàn thân của bạn')).toHaveAttribute('src', NEW_URL),
    );
    expect(screen.queryByAltText('Ảnh bạn vừa chọn, chưa lưu')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('lỗi do nội dung file (IMAGE_TOO_SMALL) bỏ preview và báo đúng thông điệp', async () => {
    const { user } = renderProfile({
      'GET /profile': ok({ profile: makeProfile({ consent: consented }) }),
      'PUT /profile/photo': fail(400, 'IMAGE_TOO_SMALL'),
    });
    await user.upload(
      await screen.findByLabelText('Chọn ảnh toàn thân', { selector: 'input' }),
      file(),
    );
    await user.click(await screen.findByRole('button', { name: 'Lưu ảnh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ảnh cần tối thiểu 512 × 1024 px.');
    expect(screen.queryByAltText('Ảnh bạn vừa chọn, chưa lưu')).not.toBeInTheDocument();
  });

  it('file sai loại bị chặn ở FE, không gọi API', async () => {
    const { user, calls } = renderProfile({
      'GET /profile': ok({ profile: makeProfile({ consent: consented }) }),
    });
    const input = await screen.findByLabelText('Chọn ảnh toàn thân', { selector: 'input' });
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.gif', { type: 'image/gif' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.',
    );
    expect(calls.map((c) => c.key)).not.toContain('PUT /profile/photo');
  });
});

describe('Trang hồ sơ: signed URL hết hạn (E13)', () => {
  it('ảnh lỗi tải thì gọi lại GET /profile đúng 1 lần, vẫn lỗi thì hiện Không tải được ảnh', async () => {
    let gets = 0;
    const { calls } = renderProfile({
      'GET /profile': () => {
        gets += 1;
        return ok({
          profile: makeProfile({
            photo: photo(gets === 1 ? OLD_URL : NEW_URL),
            consent: consented,
            heightCm: 165,
            weightKg: 50,
            profileCompleted: true,
            missing: [],
          }),
        });
      },
    });
    const img = await screen.findByAltText('Ảnh toàn thân của bạn');
    fireEvent.error(img);
    await waitFor(() =>
      expect(screen.getByAltText('Ảnh toàn thân của bạn')).toHaveAttribute('src', NEW_URL),
    );
    expect(calls.filter((c) => c.key === 'GET /profile')).toHaveLength(2);

    fireEvent.error(screen.getByAltText('Ảnh toàn thân của bạn'));
    expect(await screen.findByText('Không tải được ảnh')).toBeInTheDocument();
    // Không lặp vô hạn: không có lần gọi thứ 3.
    expect(calls.filter((c) => c.key === 'GET /profile')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('photo.url = null (ký URL lỗi) hiện trạng thái lỗi ngay, vẫn có Thay ảnh / Xóa ảnh', async () => {
    renderProfile({
      'GET /profile': ok({
        profile: makeProfile({
          photo: { ...photo(), url: null },
          consent: consented,
        }),
      }),
    });
    expect(await screen.findByText('Không tải được ảnh')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thay ảnh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xóa ảnh' })).toBeInTheDocument();
  });
});

describe('Trang hồ sơ: xóa ảnh (AC-12)', () => {
  it('hỏi xác nhận, Hủy không gọi API, Xóa ảnh cập nhật hồ sơ', async () => {
    const current = makeProfile({
      heightCm: 165,
      weightKg: 50,
      photo: photo(),
      consent: consented,
      profileCompleted: true,
      missing: [],
    });
    const { user, calls } = renderProfile({
      'GET /profile': ok({ profile: current }),
      'DELETE /profile/photo': ok({
        profile: { ...current, photo: null, profileCompleted: false, missing: ['photo'] },
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Xóa ảnh' }));
    const dialog = screen.getByRole('dialog', { name: 'Xóa ảnh?' });
    expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(calls.map((c) => c.key)).not.toContain('DELETE /profile/photo');

    await user.click(screen.getByRole('button', { name: 'Xóa ảnh' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xóa ảnh' }));
    expect(await screen.findByText('Đã xong 1/2 bước')).toBeInTheDocument();
    expect(screen.queryByAltText('Ảnh toàn thân của bạn')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Modal qua hộp thoại xóa ảnh: focus và đóng', () => {
  const withPhoto = makeProfile({
    heightCm: 165,
    weightKg: 50,
    photo: photo(),
    consent: consented,
    profileCompleted: true,
    missing: [],
  });
  const openDialog = async (routes = {}) => {
    const view = renderProfile({ 'GET /profile': ok({ profile: withPhoto }), ...routes });
    const opener = await screen.findByRole('button', { name: 'Xóa ảnh' });
    await view.user.click(opener);
    return { ...view, opener, dialog: screen.getByRole('dialog', { name: 'Xóa ảnh?' }) };
  };

  it('Tab và Shift+Tab xoay vòng trong hộp thoại, không thoát ra trang nền', async () => {
    const { user, dialog } = await openDialog();
    const cancel = within(dialog).getByRole('button', { name: 'Hủy' });
    const confirm = within(dialog).getByRole('button', { name: 'Xóa ảnh' });
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it('Esc đóng hộp thoại và trả focus về nút đã mở', async () => {
    const { user, opener } = await openDialog();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('đang xóa (busy) thì Esc và chạm nền không đóng được', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const { user, dialog } = await openDialog();
    const adapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (config) => {
      if (config.method === 'delete') await gate;
      return adapter(config);
    };
    await user.click(within(dialog).getByRole('button', { name: 'Xóa ảnh' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Hủy' })).toBeDisabled());

    await user.keyboard('{Escape}');
    await user.click(document.querySelector('.bg-scrim'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    release();
  });
});
