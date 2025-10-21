// Inspired by react-hot-toast library
import { useState, useEffect } from "react";

const TOAST_LIMIT = 20;
const TOAST_REMOVE_DELAY = 300;
const DEFAULT_TOAST_DURATION = 5000;

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

const toastRemoveTimeouts = new Map();

const addToRemoveQueue = (toastId) => {
  if (toastRemoveTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastRemoveTimeouts.delete(toastId);
    dispatch({
      type: actionTypes.REMOVE_TOAST,
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastRemoveTimeouts.set(toastId, timeout);
};

const clearFromRemoveQueue = (toastId) => {
  const timeout = toastRemoveTimeouts.get(toastId);
  if (timeout) {
    clearTimeout(timeout);
    toastRemoveTimeouts.delete(toastId);
  }
};

export const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case actionTypes.DISMISS_TOAST: {
      const { toastId } = action;

      const dismissTarget = toastId
        ? state.toasts.filter((toast) => toast.id === toastId)
        : state.toasts;

      if (dismissTarget.length === 0) {
        return state;
      }

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);

        const toastIsOpen = dismissTarget[0]?.open !== false;
        if (!toastIsOpen) {
          return state;
        }
      } else {
        dismissTarget.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }
    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        toastRemoveTimeouts.forEach((timeout) => clearTimeout(timeout));
        toastRemoveTimeouts.clear();
        return {
          ...state,
          toasts: [],
        };
      }
      clearFromRemoveQueue(action.toastId);
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners = [];

let memoryState = { toasts: [] };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

function toast({ id: providedId, ...props }) {
  const id = providedId ?? genId();

  const duration =
    typeof props.duration === "number" ? props.duration : DEFAULT_TOAST_DURATION;

  const dismiss = () => {
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
  };

  const toastState = {
    ...props,
    id,
    duration,
    open: true,
    onOpenChange: (open) => {
      if (!open) dismiss();
    },
    dismiss,
  };

  const existingToast = memoryState.toasts.find((item) => item.id === id);

  if (existingToast) {
    clearFromRemoveQueue(id);

    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: {
        ...existingToast,
        ...toastState,
      },
    });
  } else {
    dispatch({
      type: actionTypes.ADD_TOAST,
      toast: toastState,
    });
  }

  const update = (nextProps) =>
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...nextProps, id },
    });

  return {
    id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId) => dispatch({ type: actionTypes.DISMISS_TOAST, toastId }),
  };
}

export { useToast, toast, DEFAULT_TOAST_DURATION };
