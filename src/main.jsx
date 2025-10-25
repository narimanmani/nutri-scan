import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import '@/index.css';
import { AuthProvider } from '@/context/AuthContext.jsx';
import { registerServiceWorker } from '@/lib/registerServiceWorker';
import { GoogleOAuthProvider } from '@react-oauth/google';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

function withGoogleProvider(children) {
  if (!googleClientId) {
    return children;
  }

  return <GoogleOAuthProvider clientId={googleClientId}>{children}</GoogleOAuthProvider>;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {withGoogleProvider(
      <AuthProvider>
        <App />
      </AuthProvider>,
    )}
  </React.StrictMode>,
);

registerServiceWorker();
