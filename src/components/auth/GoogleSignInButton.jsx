import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let googleIdentityScriptPromise = null;

function resetGoogleIdentityScriptPromise() {
  googleIdentityScriptPromise = null;
}

function loadGoogleIdentityServices() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google sign-in is only available in the browser.'));
  }

  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google);
  }

  if (googleIdentityScriptPromise) {
    return googleIdentityScriptPromise;
  }

  googleIdentityScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-google-identity-script="true"]');

    const handleLoad = () => {
      if (window.google?.accounts?.oauth2) {
        resolve(window.google);
        return;
      }

      resetGoogleIdentityScriptPromise();
      reject(new Error('Google Identity Services failed to initialise.'));
    };

    const handleError = () => {
      resetGoogleIdentityScriptPromise();
      reject(new Error('Failed to load Google Identity Services.'));
    };

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentityScript = 'true';
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.head.appendChild(script);
  });

  return googleIdentityScriptPromise;
}

async function fetchGoogleProfile(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Unable to retrieve your Google profile. Please try again.');
  }

  const profile = await response.json();
  return {
    email: profile?.email || '',
    displayName: profile?.name || profile?.email || '',
    sub: profile?.sub || null,
  };
}

export function GoogleSignInButton({ onSuccess, onError, disabled = false }) {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [scriptError, setScriptError] = useState(null);
  const tokenClientRef = useRef(null);
  const handlersRef = useRef({ onSuccess, onError });
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    handlersRef.current = { onSuccess, onError };
  }, [onSuccess, onError]);

  useEffect(() => {
    let isActive = true;

    if (!googleClientId) {
      setIsReady(false);
      setScriptError(new Error('Google client ID is not configured.'));
      tokenClientRef.current = null;
      return () => {
        isActive = false;
      };
    }

    loadGoogleIdentityServices()
      .then((google) => {
        if (!isActive) {
          return;
        }

        if (!google?.accounts?.oauth2) {
          throw new Error('Google Identity Services are unavailable.');
        }

        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'openid email profile',
          callback: () => {},
        });

        setScriptError(null);
        setIsReady(true);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        const normalizedError =
          error instanceof Error
            ? error
            : new Error('Unable to initialise Google sign-in. Please try again later.');

        setScriptError(normalizedError);
        setIsReady(false);
        tokenClientRef.current = null;
        handlersRef.current.onError?.(normalizedError);
      });

    return () => {
      isActive = false;
    };
  }, [googleClientId]);

  const handleClick = useCallback(() => {
    if (disabled || isLoading) {
      return;
    }

    if (!isReady || !tokenClientRef.current) {
      const fallbackError =
        scriptError || new Error('Google sign-in is currently unavailable. Please try again later.');
      handlersRef.current.onError?.(fallbackError);
      return;
    }

    setIsLoading(true);

    tokenClientRef.current.callback = async (tokenResponse) => {
      if (tokenResponse?.error) {
        const error = new Error(
          tokenResponse.error_description || 'Google sign-in failed. Please try again.',
        );
        setIsLoading(false);
        handlersRef.current.onError?.(error);
        return;
      }

      try {
        if (!tokenResponse?.access_token) {
          throw new Error('Google did not provide an access token.');
        }

        const profile = await fetchGoogleProfile(tokenResponse.access_token);
        if (!profile.email) {
          throw new Error('Your Google account is missing an email address.');
        }

        await handlersRef.current.onSuccess?.(profile);
      } catch (error) {
        const normalizedError =
          error instanceof Error
            ? error
            : new Error('Unable to complete Google sign-in. Please try again.');
        handlersRef.current.onError?.(normalizedError);
      } finally {
        setIsLoading(false);
      }
    };

    try {
      tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
    } catch (error) {
      setIsLoading(false);
      const normalizedError =
        error instanceof Error
          ? error
          : new Error('Google sign-in is currently unavailable. Please try again later.');
      handlersRef.current.onError?.(normalizedError);
    }
  }, [disabled, isLoading, isReady, scriptError]);

  const isButtonDisabled = disabled || isLoading || !isReady;

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full bg-white text-emerald-900 hover:bg-emerald-50"
      onClick={handleClick}
      disabled={isButtonDisabled}
      aria-disabled={isButtonDisabled}
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Signing in…
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <GoogleIcon className="h-4 w-4" />
          Continue with Google
        </span>
      )}
    </Button>
  );
}

GoogleSignInButton.propTypes = {
  onSuccess: PropTypes.func,
  onError: PropTypes.func,
  disabled: PropTypes.bool,
};

GoogleSignInButton.defaultProps = {
  onSuccess: undefined,
  onError: undefined,
  disabled: false,
};

function GoogleIcon({ className }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 488 512"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285f4"
        d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.4 64.9C292.1 89.1 210.4 59.6 135 99.2 76.6 129.5 39.5 189 39.5 256c0 70.1 37.3 129.9 92.8 160.8 74.6 42.5 170.8 33.5 232.1-20.1 26.9-23.7 44.4-56.7 50.6-93.1H248v-80h240v38.2z"
      />
    </svg>
  );
}

GoogleIcon.propTypes = {
  className: PropTypes.string,
};

GoogleIcon.defaultProps = {
  className: '',
};
