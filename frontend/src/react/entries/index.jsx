import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from '../pages/app-root';
import '../styles/base.css';
import '../styles/kiosk.css';
import '../styles/admin.css';

const appNode = <AppRoot />;

createRoot(document.getElementById('root')).render(
  import.meta.env.DEV ? <React.StrictMode>{appNode}</React.StrictMode> : appNode
);
