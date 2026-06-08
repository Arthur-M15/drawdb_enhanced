import { createContext, useMemo, useState } from "react";
import { State } from "../data/constants";

export const SaveStateContext = createContext(State.NONE);

export default function SaveStateContextProvider({ children }) {
  const [saveState, setSaveState] = useState(State.NONE);

  const value = useMemo(() => ({ saveState, setSaveState }), [saveState]);

  return (
    <SaveStateContext.Provider value={value}>
      {children}
    </SaveStateContext.Provider>
  );
}
