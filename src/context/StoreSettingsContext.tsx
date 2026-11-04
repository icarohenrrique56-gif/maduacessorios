import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  getWhatsAppNumber,
  getWhatsAppOrderMessage,
  saveWhatsAppNumber,
  saveWhatsAppOrderMessage,
} from '../lib/storeSettings';

type StoreSettingsContextValue = {
  whatsappNumber: string;
  loading: boolean;
  error: string;
  whatsappOrderMessage: string;
  refresh: () => Promise<void>;
  saveWhatsappNumber: (value: string) => Promise<void>;
  saveWhatsappOrderMessage: (value: string) => Promise<void>;
};

const StoreSettingsContext = createContext<StoreSettingsContextValue | null>(null);

export function StoreSettingsProvider({ children }: { children: ReactNode }) {
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappOrderMessage, setWhatsappOrderMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(
          () => reject(new Error('Tempo limite ao carregar as configurações da loja.')),
          4000,
        );
      });
      const [number, orderMessage] = await Promise.race([
        Promise.all([
        getWhatsAppNumber(),
        getWhatsAppOrderMessage(),
        ]),
        timeout,
      ]);
      setWhatsappNumber(number);
      setWhatsappOrderMessage(orderMessage);
    } catch (reason) {
      setWhatsappNumber('');
      setWhatsappOrderMessage('');
      setError(reason instanceof Error ? reason.message : 'Erro inesperado ao carregar as configurações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async (value: string) => {
    setError('');
    const savedNumber = await saveWhatsAppNumber(value);
    setWhatsappNumber(savedNumber);
  }, []);

  const saveOrderMessage = useCallback(async (value: string) => {
    setError('');
    const savedMessage = await saveWhatsAppOrderMessage(value);
    setWhatsappOrderMessage(savedMessage);
  }, []);

  const value = useMemo(() => ({
    whatsappNumber,
    whatsappOrderMessage,
    loading,
    error,
    refresh,
    saveWhatsappNumber: save,
    saveWhatsappOrderMessage: saveOrderMessage,
  }), [whatsappNumber, whatsappOrderMessage, loading, error, refresh, save, saveOrderMessage]);

  return <StoreSettingsContext.Provider value={value}>{children}</StoreSettingsContext.Provider>;
}

export function useStoreSettings() {
  const context = useContext(StoreSettingsContext);
  if (!context) throw new Error('useStoreSettings deve ser usado dentro de StoreSettingsProvider.');
  return context;
}
