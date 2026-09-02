import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {STRINGS} from './strings';

const KEY = '@lang';
const LangContext = createContext(null);

export function LanguageProvider({children}) {
  const [lang, setLang] = useState('en');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => {
      if (v === 'en' || v === 'hi') {
        setLang(v);
      }
    });
  }, []);

  const change = useCallback(next => {
    setLang(next);
    AsyncStorage.setItem(KEY, next);
  }, []);

  const value = useMemo(() => {
    const dict = STRINGS[lang] || STRINGS.en;
    // t('key', {n: 3}) — substitutes {n} placeholders, falls back to English.
    const t = (key, vars) => {
      let s = dict[key];
      if (s === undefined) {
        s = STRINGS.en[key];
      }
      if (s === undefined) {
        return key;
      }
      if (vars && typeof s === 'string') {
        Object.keys(vars).forEach(k => {
          s = s.split('{' + k + '}').join(String(vars[k]));
        });
      }
      return s;
    };
    return {lang, setLang: change, t, toggle: () => change(lang === 'en' ? 'hi' : 'en')};
  }, [lang, change]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error('useLang must be used inside LanguageProvider');
  }
  return ctx;
}
