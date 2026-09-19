// Localizes worker display text that arrives from the backend. The "Worker N"
// placeholder pattern and a few known designations map to their translated
// strings; real proper names are phonetically transliterated to Devanagari when
// the language is Hindi so the roster reads in the chosen script.

import {latinToDevanagari} from './domain/translit';

// The phonetic transliterator is a best-effort fallback for names it has
// never seen; it gets enough real names wrong (wrong vowel length, wrong
// conjuncts — e.g. "Sharda" -> "शर्द" instead of "शारदा") that the actual
// pilot roster's names are listed here with their correct spelling instead
// of relying on the algorithm. Keyed by the lowercased English name exactly
// as it comes from the backend; checked before falling back to translit.
const KNOWN_NAMES_HI = {
  arjan: 'अर्जन',
  vipin: 'विपिन',
  praveen: 'प्रवीन',
  sachin: 'सचिन',
  mukesh: 'मुकेश',
  sharda: 'शारदा',
  rajesh: 'राजेश',
  tejpal: 'तेजपाल',
  sushil: 'सुशील',
  geeta: 'गीता',
  bablu: 'बबलू',
  vinod: 'विनोद',
  kusum: 'कुसुम',
  lata: 'लता',
  renu: 'रेनू',
  vikas: 'विकास',
  rahul: 'राहुल',
  shiv: 'शिव',
  rajat: 'रजत',
  sunny: 'सन्नी',
  ansh: 'अंश',
  'shiv kumar': 'शिव कुमार',
  sanjeev: 'संजीव',
  amar: 'अमर',
  sanjeet: 'संजीत',
  rakesh: 'राकेश',
  sohan: 'सोहन',
  pravesh: 'प्रवेश',
  lakshmi: 'लक्ष्मी',
  madhu: 'मधु',
  chandan: 'चन्दन',
  rajbala: 'राजबाला',
  sompal: 'सोमपाल',
  guddi: 'गुड्डी',
  nannu: 'नन्नू',
  pratap: 'प्रताप',
  rameshi: 'रमेशी',
  pitu: 'पीतू',
  usha: 'ऊषा',
  savita: 'सविता',
  manoj: 'मनोज',
  sumita: 'सुमिता',
  asha: 'आशा',
  brajesh: 'ब्रजेश',
  ramnath: 'रामनाथ',
  sangeeta: 'संगीता',
  babita: 'बबीता',
  sunita: 'सुनीता',
  anita: 'अनीता',
  kiran: 'किरन',
  'chhote lal': 'छोटे लाल',
  satish: 'सतीश',
  sanjay: 'संजय',
  vishal: 'विशाल',
  'pradeep kumar': 'प्रदीप कुमार',
  rani: 'रानी',
  amit: 'अमित',
  aman: 'अमन',
  keshav: 'केशव',
};

export function localizeWorkerName(name, tr, lang) {
  const raw = String(name || '').trim();
  const m = /^worker\s+(\d+)$/i.exec(raw);
  if (m) {
    return tr('workerN', {n: m[1]});
  }
  // Names come from the backend in Roman script; render them in Devanagari when
  // the interface is Hindi. Anything already in Devanagari is left untouched.
  if (lang === 'hi' && /[A-Za-z]/.test(raw)) {
    const key = raw.toLowerCase().replace(/\s+/g, ' ');
    return KNOWN_NAMES_HI[key] || latinToDevanagari(raw);
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
