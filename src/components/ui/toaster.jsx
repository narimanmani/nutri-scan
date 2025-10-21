import { useEffect } from "react";

import {
  useToast,
  DEFAULT_TOAST_DURATION,
} from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

function ToastItem({ title, description, action, ...props }) {
  const { onOpenChange, dismiss, open, duration, ...toastProps } = props;

  const effectiveDuration =
    typeof duration === "number" ? duration : DEFAULT_TOAST_DURATION;

  useEffect(() => {
    if (open === false || effectiveDuration === Infinity) {
      return;
    }

    const timeout = setTimeout(() => {
      if (typeof dismiss === "function") {
        dismiss();
      } else if (typeof onOpenChange === "function") {
        onOpenChange(false);
      }
    }, effectiveDuration);

    return () => {
      clearTimeout(timeout);
    };
  }, [open, effectiveDuration, dismiss, onOpenChange]);

  const handleClose = () => {
    if (typeof dismiss === "function") {
      dismiss();
    } else if (typeof onOpenChange === "function") {
      onOpenChange(false);
    }
  };

  return (
    <Toast open={open} {...toastProps}>
      <div className="grid gap-1">
        {title && <ToastTitle>{title}</ToastTitle>}
        {description && <ToastDescription>{description}</ToastDescription>}
      </div>
      {action}
      <ToastClose onClick={handleClose} />
    </Toast>
  );
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
