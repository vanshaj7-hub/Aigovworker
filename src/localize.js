// Localizes worker display text that arrives from the backend. Real proper
// names pass through unchanged; the "Worker N" placeholder pattern and a few
// known designations are translated so the roster reads in the chosen language.

export function localizeWorkerName(name, tr) {
  const m = /^worker\s+(\d+)$/i.exec(String(name || '').trim());
  return m ? tr('workerN', {n: m[1]}) : name;
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
