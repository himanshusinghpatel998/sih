import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme.css'; // pulls in style.css + auth.css as a lower-priority @layer, see theme.css
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SchemeProvider } from './context/SchemeContext';
import { ToastProvider } from './context/ToastContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <SchemeProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
            <Toaster richColors position="top-right" theme="system" />
          </AuthProvider>
        </ToastProvider>
      </SchemeProvider>
    </ThemeProvider>
  </React.StrictMode>
);
