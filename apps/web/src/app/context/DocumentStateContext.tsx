import { createContext, useContext, useReducer, ReactNode } from 'react';

type State = Record<string, unknown>;

interface UpdateStatePayload {
  state: State;
  append?: boolean;
}

function reducer(current: State, { state, append }: UpdateStatePayload): State {
  if (!append) return { ...current, ...state };

  const merged: State = { ...current };
  for (const [key, value] of Object.entries(state)) {
    if (append && Array.isArray(current[key]) && Array.isArray(value)) {
      merged[key] = [...(current[key] as unknown[]), ...(value as unknown[])];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

const DocumentStateContext = createContext<{
  state: State;
  dispatch: (payload: UpdateStatePayload) => void;
} | null>(null);

export function DocumentStateProvider({
  initialState = {},
  children,
}: {
  initialState?: State;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <DocumentStateContext.Provider value={{ state, dispatch }}>
      {children}
    </DocumentStateContext.Provider>
  );
}

export function useDocumentState() {
  const ctx = useContext(DocumentStateContext);
  if (!ctx) throw new Error('useDocumentState must be used within DocumentStateProvider');
  return ctx;
}
