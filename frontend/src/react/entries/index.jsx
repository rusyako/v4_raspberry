import React from 'react';
import { createRoot } from 'react-dom/client';
import { KioskPage } from '../pages/kiosk-page';
import '../styles/base.css';
import '../styles/kiosk.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <KioskPage />
  </React.StrictMode>
);
