import { describe, expect, it } from 'vitest';
import {
  PHOTO_MAX_BYTES,
  PHOTO_MESSAGES,
  checkPhotoDimensions,
  checkPhotoFile,
} from './photoRules.js';
import { mapPhotoError } from './profileErrors.js';

describe('checkPhotoFile (D-11)', () => {
  it('chấp nhận JPG/PNG/WEBP đúng 10 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(checkPhotoFile({ type, size: PHOTO_MAX_BYTES })).toBeNull();
    }
  });

  it('từ chối loại khác (HEIC, GIF, PDF, rỗng) và file quá 10 MB', () => {
    for (const type of ['image/heic', 'image/gif', 'application/pdf', '']) {
      expect(checkPhotoFile({ type, size: 1000 })).toBe(PHOTO_MESSAGES.type);
    }
    expect(checkPhotoFile({ type: 'image/png', size: PHOTO_MAX_BYTES + 1 })).toBe(
      PHOTO_MESSAGES.size,
    );
  });
});

describe('checkPhotoDimensions', () => {
  it.each([
    [512, 1024, null], // đúng biên nhỏ nhất, tỉ lệ 2
    [800, 1400, null],
    [1000, 1300, null], // đúng biên tỉ lệ 1,3
    [1000, 2500, null], // đúng biên tỉ lệ 2,5
    [511, 1024, PHOTO_MESSAGES.tooSmall],
    [512, 1023, PHOTO_MESSAGES.tooSmall],
    [1920, 1080, PHOTO_MESSAGES.ratio], // ảnh ngang đủ lớn
    [4000, 8001, PHOTO_MESSAGES.tooLarge],
    [8001, 1200, PHOTO_MESSAGES.tooLarge], // quá lớn ưu tiên hơn tỉ lệ (khớp backend)
    [1000, 1299, PHOTO_MESSAGES.ratio],
    [1000, 2501, PHOTO_MESSAGES.ratio],
    [3000, 400, PHOTO_MESSAGES.tooSmall],
    [1100, 1100, PHOTO_MESSAGES.ratio], // vuông đủ lớn
    [0, 0, PHOTO_MESSAGES.unreadable],
    [NaN, 1500, PHOTO_MESSAGES.unreadable],
  ])('%d × %d -> %s', (width, height, expected) => {
    expect(checkPhotoDimensions({ width, height })).toBe(expected);
  });
});

describe('mapPhotoError', () => {
  it('lỗi do nội dung file thì bỏ preview, lỗi tạm thời thì giữ preview để gửi lại', () => {
    expect(mapPhotoError({ code: 'IMAGE_TOO_SMALL' })).toMatchObject({
      message: PHOTO_MESSAGES.tooSmall,
      discardPreview: true,
    });
    for (const error of [
      { code: 'UPLOAD_FAILED', status: 500 },
      { code: 'INTERNAL_ERROR', status: 500 },
      { code: 'NETWORK_ERROR', status: 0 },
      { code: 'VALIDATION_ERROR', status: 400 },
    ]) {
      expect(mapPhotoError(error).discardPreview).toBe(false);
    }
    expect(mapPhotoError({ code: 'NETWORK_ERROR' }).message).toBe('Mất kết nối, vui lòng thử lại.');
  });

  it('429 lấy thời gian chờ từ retryAfterSeconds, thiếu thì dùng thông báo theo giờ', () => {
    expect(
      mapPhotoError({ code: 'TOO_MANY_REQUESTS', details: { retryAfterSeconds: 90 } }),
    ).toMatchObject({ kind: 'rate', retryAfterSeconds: 90 });
    const noWait = mapPhotoError({ code: 'TOO_MANY_REQUESTS' });
    expect(noWait.retryAfterSeconds).toBeNull();
    expect(noWait.message).toContain('1 giờ');
  });

  it('CONSENT_REQUIRED được tách riêng để mở lại checkbox', () => {
    expect(mapPhotoError({ code: 'CONSENT_REQUIRED' }).kind).toBe('consent');
  });
});
