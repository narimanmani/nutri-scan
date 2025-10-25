import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import PropTypes from 'prop-types';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

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

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: 'openid email profile',
    onSuccess: async (tokenResponse) => {
      try {
        if (!tokenResponse?.access_token) {
          throw new Error('Google did not provide an access token.');
        }

        const profile = await fetchGoogleProfile(tokenResponse.access_token);
        if (!profile.email) {
          throw new Error('Your Google account is missing an email address.');
        }

        await onSuccess?.(profile);
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error
            : new Error('Unable to complete Google sign-in. Please try again.'),
        );
      } finally {
        setIsLoading(false);
      }
    },
    onError: (errorResponse) => {
      setIsLoading(false);
      onError?.(
        errorResponse instanceof Error
          ? errorResponse
          : new Error('Google sign-in was cancelled or failed. Please try again.'),
      );
    },
  });

  const handleClick = () => {
    if (disabled || isLoading) {
      return;
    }

    setIsLoading(true);
    login();
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full bg-white text-emerald-900 hover:bg-emerald-50"
      onClick={handleClick}
      disabled={disabled || isLoading}
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

GoogleSignInButton.defaultProps = {
  onSuccess: undefined,
  onError: undefined,
  disabled: false,
};

