// Localizes worker display text that arrives from the backend. The "Worker N"
// placeholder pattern and a few known designations map to their translated
// strings; real proper names are phonetically transliterated to Devanagari when
// the language is Hindi so the roster reads in the chosen script.

import {latinToDevanagari} from './domain/translit';

export function localizeWorkerName(name, tr, lang) {
  const raw = String(name || '').trim();
  const m = /^worker\s+(\d+)$/i.exec(raw);
  if (m) {
    return tr('workerN', {n: m[1]});
  }
  // Names come from the backend in Roman script; render them in Devanagari when
  // the interface is Hindi. Anything already in Devanagari is left untouched.
  if (lang === 'hi' && /[A-Za-z]/.test(raw)) {
    return latinToDevanagari(raw);
  }
  return name;
}

const DESIGNATION_KEYS = {
  worker: 'desgWorker',
  'safai karamchari': 'desgSafai',
  'safai karmi': 'desgSafai',
  driver: 'desgDriver',
  supervisor: 'desgSupervisor',
};

export function localizeDesignation(designation, tr) {
  const key = DESIGNATION_KEYS[String(designation || '').trim().toLowerCase()];
  return key ? tr(key) : designation;
}
