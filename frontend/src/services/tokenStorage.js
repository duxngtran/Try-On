const KEY = 'tryon.token';

// localStorage có thể ném lỗi (chế độ riêng tư, bị chặn) nên mọi truy cập đều bọc try/catch.
export const tokenStorage = {
  get() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* bỏ qua: phiên chỉ tồn tại trong bộ nhớ */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* bỏ qua */
    }
  },
};
