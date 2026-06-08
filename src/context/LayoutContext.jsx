import { createContext, useMemo, useState } from "react";

export const LayoutContext = createContext(null);

export default function LayoutContextProvider({ children }) {
  const [layout, setLayout] = useState({
    header: true,
    sidebar: true,
    issues: true,
    toolbar: true,
    dbmlEditor: false,
    readOnly: false,
  });

  const value = useMemo(() => ({ layout, setLayout }), [layout]);

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  );
}
