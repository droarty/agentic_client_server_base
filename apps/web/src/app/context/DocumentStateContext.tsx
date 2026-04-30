import { createContext, useContext, useReducer, ReactNode } from 'react';

type State = Record<string, unknown>;

interface UpdateStatePayload {
  state: State;
}

function reducer(current: State, { state }: UpdateStatePayload): State {
  return { ...current, ...state };
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
