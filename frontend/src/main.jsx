import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import '@fontsource-variable/manrope';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-ext-600.css';
import '@fontsource/playfair-display/vietnamese-600.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-ext-700.css';
import '@fontsource/playfair-display/vietnamese-700.css';
import './index.css';
import { appRouteObjects } from './routes/appRouteObjects.jsx';

const router = createBrowserRouter(appRouteObjects);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
