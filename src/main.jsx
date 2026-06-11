import React from 'react';
import { createRoot } from 'react-dom/client';

import './styles/theme.css';
import './styles/core.css';
import './styles/home.css';
import './styles/portals.css';
import './styles/responsive.css';

import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
