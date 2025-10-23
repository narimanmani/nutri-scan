import { useState } from 'react';
import { Smartphone, Trash2, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { usePWA } from '@/hooks/usePWA';

export default function PWAControls() {
  const {
    canInstall,
    install,
    remove,
    pushPermission,
    requestPushPermission,
    triggerTestNotification,
    supportsNotifications,
    serviceWorkerReady,
    hasServiceWorkerSupport,
    isIos,
    isStandalone,
  } = usePWA();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleInstall = async () => {
    try {
      setIsProcessing(true);
      if (isIos && !canInstall) {
        toast({
          title: 'Install on iOS',
          description: 'Tap the share icon in Safari and choose "Add to Home Screen" to finish installing.',
        });
        return;
      }

      if (!canInstall) {
        throw new Error('Install prompt is not available in this browser session yet.');
      }

      const outcome = await install();
      toast({
        title: outcome === 'accepted' ? 'Installation started' : 'Installation dismissed',
        description:
          outcome === 'accepted'
            ? 'Follow your browser prompts to add Nutri Scan to your home screen.'
            : 'You can open this menu again whenever you are ready.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to install',
        description: error.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoval = async () => {
    try {
      setIsProcessing(true);
      await remove();
      toast({
        title: 'PWA data removed',
        description: 'Cached assets and service workers have been cleared. Remove the icon from your device to finish.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to remove PWA',
        description: error.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnableNotifications = async () => {
    try {
      setIsProcessing(true);
      if (pushPermission !== 'granted') {
        await requestPushPermission();
      }
      await triggerTestNotification();
      toast({
        title: 'Push notifications enabled',
        description: 'We sent a sample notification so you can confirm delivery.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Notification error',
        description: error.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const notificationButtonDisabled =
    !supportsNotifications || pushPermission === 'denied' || !serviceWorkerReady || isProcessing;

  if (!hasServiceWorkerSupport) {
    return null;
  }

  return (
    <div className="rounded-xl border border-emerald-100 bg-white/80 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-full bg-emerald-100 p-2 text-emerald-700">
          <Smartphone className="h-4 w-4" />
        </div>
        <div className="space-y-2 text-sm text-emerald-900">
          <p className="font-semibold">Install Nutri Scan as an app</p>
          {!canInstall && !isStandalone && !isIos && (
            <p className="text-emerald-700/80">
              Open this site in Chrome or Edge on your Android device to get the install prompt.
            </p>
          )}
          {isIos && !isStandalone && (
            <p className="text-emerald-700/80">
              Tap the share icon in Safari, then choose <strong>Add to Home Screen</strong> to install on iOS.
            </p>
          )}
          {isStandalone && (
            <p className="text-emerald-700/80">You are already using the installed version of Nutri Scan.</p>
          )}

          <div className="grid gap-2 pt-2">
            <Button
              onClick={handleInstall}
              disabled={(!canInstall && !isIos) || isProcessing}
              className="justify-start bg-emerald-500 text-white hover:bg-emerald-600"
            >
              <Smartphone className="mr-2 h-4 w-4" /> Install app
            </Button>
            <Button
              onClick={handleRemoval}
              disabled={isProcessing}
              variant="outline"
              className="justify-start border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Remove cached app data
            </Button>
            <Button
              onClick={handleEnableNotifications}
              disabled={notificationButtonDisabled}
              variant="secondary"
              className="justify-start bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              <BellRing className="mr-2 h-4 w-4" /> Enable push notifications
            </Button>
            {!supportsNotifications && (
              <p className="text-xs text-emerald-600/80">
                Push notifications are not available in this browser. Try using the installed app on a supported device.
              </p>
            )}
            {!serviceWorkerReady && (
              <p className="text-xs text-emerald-600/80">
                The background service worker is still starting up. Push notifications will be available once it is ready.
              </p>
            )}
            {pushPermission === 'denied' && (
              <p className="text-xs text-red-500">
                Notifications are blocked for this site. Enable them in your browser settings to receive alerts.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
