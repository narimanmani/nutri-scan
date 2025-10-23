import { useCallback, useEffect, useMemo, useState } from 'react';

function isStandaloneDisplay() {
  if (typeof window === 'undefined') {
    return false;
  }

  const mediaQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)') : null;
  const isStandalone = mediaQuery ? mediaQuery.matches : false;
  const isIosStandalone = window.navigator?.standalone === true;
  return Boolean(isStandalone || isIosStandalone);
}

function detectIos() {
  if (typeof window === 'undefined') {
    return false;
  }

  return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(isStandaloneDisplay());
  const [pushPermission, setPushPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [serviceWorkerReady, setServiceWorkerReady] = useState(false);
  const [hasServiceWorkerSupport, setHasServiceWorkerSupport] = useState(
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    setIsInstalled(isStandaloneDisplay());

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.ready
      .then(() => setServiceWorkerReady(true))
      .catch(() => setServiceWorkerReady(false));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const listener = (event) => {
      setHasServiceWorkerSupport(typeof navigator !== 'undefined' && 'serviceWorker' in navigator);
      setIsInstalled(isStandaloneDisplay());
      return event;
    };

    window.addEventListener('visibilitychange', listener);

    return () => {
      window.removeEventListener('visibilitychange', listener);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      throw new Error('Install prompt is not available.');
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (outcome === 'accepted') {
      setIsInstalled(true);
    }

    return outcome;
  }, [deferredPrompt]);

  const remove = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers are not supported in this browser.');
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    setIsInstalled(false);
    setServiceWorkerReady(false);
  }, []);

  const requestPushPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      throw new Error('This browser does not support notifications.');
    }

    const permission = await Notification.requestPermission();
    setPushPermission(permission);

    if (permission !== 'granted') {
      throw new Error('Notification permission was not granted.');
    }

    return permission;
  }, []);

  const triggerTestNotification = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers are not supported in this browser.');
    }

    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      throw new Error('Push notifications are not enabled.');
    }

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Nutri Scan', {
      body: 'Sample push notification to confirm everything works! 🥗',
      icon: '/vite.svg',
      badge: '/vite.svg',
      data: { url: '/' },
    });
  }, []);

  const ios = useMemo(() => detectIos(), []);

  return {
    canInstall: Boolean(deferredPrompt),
    install,
    isInstalled,
    remove,
    pushPermission,
    requestPushPermission,
    triggerTestNotification,
    supportsNotifications: typeof Notification !== 'undefined',
    serviceWorkerReady,
    hasServiceWorkerSupport,
    isIos: ios,
    isStandalone: isStandaloneDisplay(),
  };
}
