/**
 * main.tsx
 * 
 * The entry point for the React application. It initializes the React root
 * and renders the App component within StrictMode.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
