import { AdminPage } from './admin-page';
import { KioskPage } from './kiosk-page';

export function AppRoot() {
  const pathname = (window.location.pathname || '/').toLowerCase();
  const hostname = window.location.hostname.toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  const shouldRedirectNetworkHome = !import.meta.env.DEV && pathname === '/' && !isLocalhost;

  if (shouldRedirectNetworkHome) {
    window.location.replace('/admin');
    return null;
  }

  if (pathname === '/admin') {
    return <AdminPage />;
  }

  return <KioskPage />;
}
