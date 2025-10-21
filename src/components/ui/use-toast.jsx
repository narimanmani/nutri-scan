// Inspired by react-hot-toast library
import { useState, useEffect, createContext, useContext } from "react";

const TOAST_LIMIT = 20;
const TOAST_REMOVE_DELAY = 1000;
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
const toastAutoDismissTimeouts = new Map();

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

const clearAutoDismiss = (toastId) => {
  const timeout = toastAutoDismissTimeouts.get(toastId);
  if (timeout) {
    clearTimeout(timeout);
    toastAutoDismissTimeouts.delete(toastId);
  }
};

const scheduleAutoDismiss = (toastId, duration) => {
  if (duration === Infinity) {
    return;
  }

  clearAutoDismiss(toastId);

  const timeout = setTimeout(() => {
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId });
  }, duration);

  toastAutoDismissTimeouts.set(toastId, timeout);
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

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        clearAutoDismiss(toastId);
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          clearAutoDismiss(toast.id);
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
        return {
          ...state,
          toasts: [],
        };
      }
      clearAutoDismiss(action.toastId);
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

function toast({ ...props }) {
  const id = genId();

  const duration =
    typeof props.duration === "number" ? props.duration : DEFAULT_TOAST_DURATION;

  const update = (props) =>
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...props, id },
    });

  const dismiss = () => {
    clearAutoDismiss(id);
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
  };

  dispatch({
    type: actionTypes.ADD_TOAST,
    toast: {
      ...props,
      id,
      duration,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
      dismiss,
    },
  });

  scheduleAutoDismiss(id, duration);

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
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId) => dispatch({ type: actionTypes.DISMISS_TOAST, toastId }),
  };
}

export { useToast, toast }; 