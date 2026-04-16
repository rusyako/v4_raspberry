import React from 'react';
import { createRoot } from 'react-dom/client';
import { KioskPage } from '../pages/kiosk-page';
import '../styles/base.css';
import '../styles/kiosk.css';

const kioskNode = <KioskPage />;

createRoot(document.getElementById('root')).render(
  import.meta.env.DEV ? <React.StrictMode>{kioskNode}</React.StrictMode> : kioskNode
);
