import { createContext, useContext, useState, useEffect } from 'react';
import { translations } from './translations';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('civtangle-lang') || 'en';
  });

  useEffect(() => {
    localStorage.setItem('civtangle-lang', lang);
  }, [lang]);

  const t = (key) => {
    return translations[lang][key] || translations['en'][key] || key;
  };

  const toggleLang = () => {
    setLang(l => l === 'en' ? 'fr' : 'en');
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
