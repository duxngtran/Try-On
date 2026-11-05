import { AuthProvider } from '../features/auth/AuthProvider.jsx';
import { AppRoutes } from './AppRoutes.jsx';

/** Gốc của app bên trong data router: AuthProvider cần các hook điều hướng nên phải nằm dưới Router. */
export function AppRoot() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
