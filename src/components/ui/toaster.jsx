import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const { onOpenChange, dismiss, open, ...toastProps } = props;

        const handleClose = () => {
          if (typeof dismiss === "function") {
            dismiss();
          } else if (typeof onOpenChange === "function") {
            onOpenChange(false);
          }
        };

        return (
          <Toast key={id} open={open} {...toastProps}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose onClick={handleClose} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
} 