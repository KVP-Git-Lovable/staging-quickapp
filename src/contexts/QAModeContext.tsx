import React, { createContext, useContext } from 'react';

interface QAModeContextType {
  isQAMode: boolean;
  tablePrefix: string;
}

const QAModeContext = createContext<QAModeContextType>({
  isQAMode: false,
  tablePrefix: '',
});

export const QAModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const isQAMode = import.meta.env.VITE_APP_MODE === 'qa';
  const tablePrefix = import.meta.env.VITE_TABLE_PREFIX ?? '';
  return (
    <QAModeContext.Provider value={{ isQAMode, tablePrefix }}>
      {children}
    </QAModeContext.Provider>
  );
};

export const useQAMode = () => useContext(QAModeContext);
