// Design tokens sampled directly from the approved screen designs.
// Palette is Google Material (Google Blue / Green / Red / Yellow ramps).
export const c = {
  primary: '#4285F4',
  primaryDark: '#1A73E8',
  primaryDeep: '#185ABC',
  primaryContainer: '#D2E3FC',
  onPrimaryContainer: '#185ABC',

  success: '#34A853',
  successContainer: '#CEEAD6',
  onSuccessContainer: '#137333',

  error: '#EA4335',
  errorContainer: '#FCE8E6',
  onErrorContainer: '#C5221F',

  warning: '#F9AB00',
  warningStrong: '#EA8600',
  warningContainer: '#FEF7E0',
  onWarningContainer: '#B06000',

  surface: '#FFFFFF',
  bg: '#F8F9FA',
  bgAlt: '#F1F3F4',
  outline: '#DADCE0',
  outlineSoft: '#E8EAED',
  fill: '#F1F3F4',

  text: '#202124',
  textMuted: '#5F6368',
  textDisabled: '#9AA0A6',

  camBg: '#202124',
  camBar: '#25272B',
  camChip: 'rgba(255,255,255,0.16)',
};

export const r = { field: 8, card: 12, chip: 8, pill: 999 };

export const t = {
  display: { fontSize: 28, fontWeight: '400', color: c.text },
  title: { fontSize: 20, fontWeight: '600', color: c.text },
  cardTitle: { fontSize: 16, fontWeight: '600', color: c.text },
  body: { fontSize: 14, color: c.text },
  bodyMuted: { fontSize: 14, color: c.textMuted },
  small: { fontSize: 12, color: c.textMuted },
  label: {
    fontSize: 11.5,
    fontWeight: '600',
    color: c.textMuted,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
};

export const elevation = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};
