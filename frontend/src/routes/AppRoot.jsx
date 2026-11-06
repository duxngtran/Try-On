import { CartProvider } from '../features/cart/CartProvider.jsx';
import { AuthProvider } from '../features/auth/AuthProvider.jsx';
import { AppRoutes } from './AppRoutes.jsx';

/**
 * Gốc của app bên trong data router: AuthProvider cần các hook điều hướng nên phải nằm dưới Router.
 * CartProvider nằm trong AuthProvider (cần biết người dùng) và ngoài mọi trang, nên giỏ sống qua điều hướng.
 */
export function AppRoot() {
  return (
    <AuthProvider>
      <CartProvider>
        <AppRoutes />
      </CartProvider>
    </AuthProvider>
  );
}
