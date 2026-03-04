import React from 'react';
import { createRoot } from 'react-dom/client';
import PaperManager from './paper-manager-v2.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PaperManager />
  </React.StrictMode>
);
