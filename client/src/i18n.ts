import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/eng.json';
import uk from '@/locales/uk.json';

const resources = {
  en: { translation: en },
  uk: { translation: uk },
};

const initLanguage = () => {
  const language = localStorage.getItem('language');
  return language === undefined || language === null || language === '' ? 'uk' : language;
}

i18n.use(initReactI18next).init({
  lng: initLanguage(),
  resources: resources,
  interpolation: { escapeValue: false },
  //keySeparator: false,
  // debug: true,
  //saveMissing: true,
});

export default i18n;
