import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MIcon from 'react-native-vector-icons/MaterialIcons';
import {c, elevation, r, t} from './theme';
import {useLang} from './i18n';
import {initials as toInitials} from './domain/shifts';

/**
 * A softly pulsing placeholder block ("glass shade" loader) shown while real
 * data is being fetched, so a screen never flashes stale or dummy content.
 */
export function Skeleton({width = '100%', height = 14, radius = 8, style}) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 800, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 0, duration: 800, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const opacity = pulse.interpolate({inputRange: [0, 1], outputRange: [0.3, 0.65]});
  return (
    <Animated.View
      style={[{width, height, borderRadius: radius, backgroundColor: c.fill, opacity}, style]}
    />
  );
}

/** A skeleton stand-in for a worker/list row: round avatar + two text lines. */
export function SkeletonRow() {
  return (
    <View style={sk.row}>
      <Skeleton width={44} height={44} radius={22} />
      <View style={{flex: 1, marginLeft: 14}}>
        <Skeleton width={'55%'} height={15} />
        <Skeleton width={'35%'} height={12} style={{marginTop: 8}} />
      </View>
      <Skeleton width={64} height={24} radius={12} />
    </View>
  );
}

/** A column of `n` skeleton rows. */
export function SkeletonList({n = 6}) {
  return (
    <View>
      {Array.from({length: n}).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15},
});

export function Icon({name, size = 22, color = c.textMuted, style}) {
  return <MIcon name={name} size={size} color={color} style={style} />;
}

/* ------------------------------------------------------------------ layout */

export function Screen({children, style, bg}) {
  return <View style={[s.screen, bg ? {backgroundColor: bg} : null, style]}>{children}</View>;
}

export function AppBar({title, onBack, right, subtitle}) {
  return (
    <View style={s.appBar}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={s.appBarIcon}>
          <Icon name="arrow-back" size={24} color={c.text} />
        </Pressable>
      ) : null}
      <View style={{flex: 1}}>
        <Text style={s.appBarTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={t.small}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export const Divider = ({style}) => <View style={[s.divider, style]} />;

export function SectionLabel({children, right, style}) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={t.label}>{children}</Text>
      {right}
    </View>
  );
}

export function Card({children, style, onPress}) {
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap
      onPress={onPress}
      android_ripple={onPress ? {color: '#00000010'} : undefined}
      style={[s.card, style]}>
      {children}
    </Wrap>
  );
}

/* ----------------------------------------------------------------- buttons */

export function FilledButton({label, onPress, disabled, busy, icon, style}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      android_ripple={{color: '#FFFFFF33'}}
      style={[s.filled, (disabled || busy) && s.filledDisabled, style]}>
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <View style={s.btnRow}>
          {icon ? <Icon name={icon} size={20} color="#fff" style={{marginRight: 8}} /> : null}
          <Text style={s.filledLabel}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function OutlinedButton({label, onPress, disabled, style}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{color: '#1A73E815'}}
      style={[s.outlined, style]}>
      <Text style={s.outlinedLabel}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({label, onPress, style, color}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[s.textBtn, style]}>
      <Text style={[s.textBtnLabel, color ? {color} : null]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ inputs */

/** Material outlined field with a notched floating label. */
export function Field({
  label,
  value,
  onChangeText,
  icon,
  secure,
  keyboardType,
  editable = true,
  multiline,
  placeholder,
  right,
  onPress,
  style,
}) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const floating = focused || !!value;
  const Wrap = onPress ? Pressable : View;

  return (
    <Wrap onPress={onPress} style={[{marginBottom: 16}, style]}>
      <View
        style={[
          s.field,
          multiline && {height: 84, alignItems: 'flex-start', paddingTop: 14},
          focused && {borderColor: c.primary, borderWidth: 2},
        ]}>
        {icon ? <Icon name={icon} size={20} style={{marginRight: 12}} /> : null}
        {onPress ? (
          <Text style={[s.fieldText, !value && {color: c.textMuted}]} numberOfLines={1}>
            {value || placeholder || ''}
          </Text>
        ) : (
          <TextInput
            style={[s.fieldText, multiline && {textAlignVertical: 'top', height: 56}]}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            secureTextEntry={secure && !reveal}
            keyboardType={keyboardType}
            editable={editable}
            multiline={multiline}
            placeholder={floating ? '' : placeholder || label}
            placeholderTextColor={c.textMuted}
            underlineColorAndroid="transparent"
          />
        )}
        {secure ? (
          <Pressable onPress={() => setReveal(v => !v)} hitSlop={10}>
            <Icon name={reveal ? 'visibility-off' : 'visibility'} size={20} />
          </Pressable>
        ) : null}
        {right}
      </View>
      {floating ? (
        <View style={s.notch}>
          <Text style={[s.notchLabel, focused && {color: c.primary}]}>{label}</Text>
        </View>
      ) : null}
    </Wrap>
  );
}

/* ------------------------------------------------------------------- chips */

export function FilterChip({label, selected, onPress, icon, style}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{color: '#1A73E815'}}
      style={[s.chip, selected ? s.chipOn : s.chipOff, style]}>
      {selected ? (
        <Icon name="check" size={17} color={c.onPrimaryContainer} style={{marginRight: 6}} />
      ) : icon ? (
        <Icon name={icon} size={17} color={c.textMuted} style={{marginRight: 6}} />
      ) : null}
      <Text style={[s.chipLabel, selected && {color: c.onPrimaryContainer, fontWeight: '600'}]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Large segmented pills used for the shift picker. */
export function SegmentPill({label, icon, selected, onPress, style, disabled}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      android_ripple={{color: '#00000010'}}
      style={[s.segment, selected ? s.segmentOn : s.segmentOff, disabled && {opacity: 0.4}, style]}>
      <Icon name={icon} size={19} color={selected ? '#fff' : c.textMuted} style={{marginRight: 8}} />
      <Text style={[s.segmentLabel, selected && {color: '#fff'}]}>{label}</Text>
    </Pressable>
  );
}

const TONE = {
  present: {bg: c.successContainer, fg: c.onSuccessContainer},
  success: {bg: c.successContainer, fg: c.onSuccessContainer},
  absent: {bg: c.errorContainer, fg: c.onErrorContainer},
  error: {bg: c.errorContainer, fg: c.onErrorContainer},
  leave: {bg: c.warningContainer, fg: c.onWarningContainer},
  warning: {bg: c.warningContainer, fg: c.onWarningContainer},
  pending: {bg: c.fill, fg: c.textMuted},
  neutral: {bg: c.fill, fg: c.textMuted},
  info: {bg: c.primaryContainer, fg: c.onPrimaryContainer},
};

export function StatusPill({label, tone = 'neutral', style}) {
  const p = TONE[tone] || TONE.neutral;
  return (
    <View style={[s.pill, {backgroundColor: p.bg}, style]}>
      <Text style={[s.pillLabel, {color: p.fg}]}>{label}</Text>
    </View>
  );
}

/** Small circular S1/S2 marker used in history rows. */
export function StatusDot({letter, tone = 'pending'}) {
  const p = TONE[tone] || TONE.pending;
  return (
    <View style={[s.dot, {backgroundColor: p.bg}]}>
      <Text style={[s.dotLabel, {color: p.fg}]}>{letter}</Text>
    </View>
  );
}

/* ----------------------------------------------------------------- banners */

export function Banner({tone = 'info', icon, title, body, style, right}) {
  const p = TONE[tone] || TONE.info;
  const fg = tone === 'warning' ? c.warningStrong : p.fg;
  return (
    <View style={[s.banner, {backgroundColor: p.bg}, style]}>
      {icon ? <Icon name={icon} size={22} color={fg} style={{marginRight: 12}} /> : null}
      <View style={{flex: 1}}>
        {title ? <Text style={[s.bannerTitle, {color: p.fg}]}>{title}</Text> : null}
        {body ? <Text style={[s.bannerBody, {color: p.fg}]}>{body}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Neutral grey explanatory block. */
export function InfoBlock({icon, children, style}) {
  return (
    <View style={[s.infoBlock, style]}>
      {icon ? <Icon name={icon} size={20} style={{marginRight: 12, marginTop: 1}} /> : null}
      <Text style={[t.body, {flex: 1, lineHeight: 21, color: c.text}]}>{children}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ pieces */

export function Avatar({name, uri, size = 44, bg = c.fill, fg = c.textMuted}) {
  // Track the specific URI that failed, not a sticky boolean — otherwise once a
  // photo failed to load (e.g. a just-uploaded URL that 404s for a moment) the
  // circle stayed on initials forever, even after the worker's photo changed to a
  // valid URL. For a remote photo we also retry once after a short delay, since a
  // freshly uploaded image can be briefly unavailable.
  const [failedUri, setFailedUri] = useState(null);
  const [nonce, setNonce] = useState(0);
  const retried = useRef(false);
  useEffect(() => {
    setFailedUri(null);
    setNonce(0);
    retried.current = false;
  }, [uri]);

  const isRemote = !!uri && /^https?:/i.test(uri);
  if (uri && failedUri !== uri) {
    const src =
      isRemote && nonce ? `${uri}${uri.includes('?') ? '&' : '?'}_r=${nonce}` : uri;
    return (
      <Image
        key={src}
        source={{uri: src}}
        onError={() => {
          if (isRemote && !retried.current) {
            retried.current = true;
            setTimeout(() => setNonce(n => n + 1), 1200);
          } else {
            setFailedUri(uri);
          }
        }}
        style={{width: size, height: size, borderRadius: size / 2}}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{color: fg, fontWeight: '600', fontSize: size * 0.34}}>{toInitials(name)}</Text>
    </View>
  );
}

export function ProgressBar({value, total, color = c.success, height = 6}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return (
    <View style={[s.track, {height, borderRadius: height / 2}]}>
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

export function LegendDot({color, label, value}) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, {backgroundColor: color}]} />
      <Text style={s.legendLabel}>{label}</Text>
      <Text style={s.legendValue}>{value}</Text>
    </View>
  );
}

export function Switch({value, onValueChange}) {
  return (
    <Pressable onPress={() => onValueChange(!value)} hitSlop={8}>
      <View style={[s.switchTrack, value && {backgroundColor: c.primary}]}>
        <View style={[s.switchKnob, value && s.switchKnobOn]}>
          {value ? <Icon name="check" size={13} color={c.primary} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** EN / हिं interface-language toggle. Present on login and home. */
export function LanguageToggle({style}) {
  const {lang, setLang} = useLang();
  return (
    <View style={[s.langWrap, style]}>
      {['en', 'hi'].map(k => {
        const on = lang === k;
        return (
          <Pressable
            key={k}
            onPress={() => setLang(k)}
            style={[s.langBtn, on && s.langBtnOn]}
            hitSlop={4}>
            <Text style={[s.langLabel, on && {color: c.primaryDark, fontWeight: '700'}]}>
              {k === 'en' ? 'EN' : 'हिं'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Live password-policy checklist used on sign-up and password reset. */
export function PasswordChecklist({results, labels, style}) {
  return (
    <View style={[{marginTop: -6, marginBottom: 16}, style]}>
      {results.map(r => (
        <View key={r.key} style={s.ruleRow}>
          <Icon
            name={r.ok ? 'check-circle' : 'radio-button-unchecked'}
            size={17}
            color={r.ok ? c.success : c.textDisabled}
            style={{marginRight: 9}}
          />
          <Text style={[s.ruleText, r.ok && {color: c.onSuccessContainer}]}>{labels[r.key]}</Text>
        </View>
      ))}
    </View>
  );
}

export function BottomBar({children, style}) {
  return <View style={[s.bottomBar, style]}>{children}</View>;
}

export function EmptyState({icon, text}) {
  return (
    <View style={s.empty}>
      {icon ? <Icon name={icon} size={40} color={c.textDisabled} /> : null}
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {flex: 1, backgroundColor: c.bg},
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingHorizontal: 16,
    backgroundColor: c.surface,
  },
  appBarIcon: {marginRight: 16},
  appBarTitle: {fontSize: 20, fontWeight: '600', color: c.text},
  divider: {height: 1, backgroundColor: c.outlineSoft},

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },

  card: {
    backgroundColor: c.surface,
    borderRadius: r.card,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    padding: 16,
    ...elevation,
  },

  filled: {
    backgroundColor: c.primary,
    borderRadius: r.pill,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  filledDisabled: {backgroundColor: '#A8C7F7'},
  filledLabel: {color: '#fff', fontSize: 15, fontWeight: '600'},
  btnRow: {flexDirection: 'row', alignItems: 'center'},

  outlined: {
    borderRadius: r.pill,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.outline,
    backgroundColor: c.surface,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  outlinedLabel: {color: c.primaryDark, fontSize: 15, fontWeight: '600'},

  textBtn: {alignItems: 'center', justifyContent: 'center', paddingVertical: 12},
  textBtnLabel: {color: c.primaryDark, fontSize: 15, fontWeight: '600'},

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: r.field,
    paddingHorizontal: 14,
    backgroundColor: c.surface,
  },
  fieldText: {flex: 1, fontSize: 16, color: c.text, padding: 0},
  notch: {
    position: 'absolute',
    top: -8,
    left: 12,
    paddingHorizontal: 5,
    backgroundColor: c.surface,
  },
  notchLabel: {fontSize: 12, color: c.textMuted},

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingHorizontal: 14,
    borderRadius: r.chip,
    borderWidth: 1,
    marginRight: 8,
  },
  chipOn: {backgroundColor: c.primaryContainer, borderColor: c.primaryContainer},
  chipOff: {backgroundColor: c.surface, borderColor: c.outline},
  chipLabel: {fontSize: 14, color: c.text},

  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: r.pill,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segmentOn: {backgroundColor: c.primary, borderColor: c.primary},
  segmentOff: {backgroundColor: c.surface, borderColor: c.outline},
  segmentLabel: {fontSize: 15, fontWeight: '600', color: c.text},

  pill: {paddingHorizontal: 12, paddingVertical: 5, borderRadius: r.pill},
  pillLabel: {fontSize: 12.5, fontWeight: '600'},

  dot: {width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  dotLabel: {fontSize: 12.5, fontWeight: '700'},

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: r.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerTitle: {fontSize: 14.5, fontWeight: '600'},
  bannerBody: {fontSize: 13, marginTop: 1},

  infoBlock: {
    flexDirection: 'row',
    backgroundColor: c.bg,
    borderRadius: r.card,
    padding: 14,
  },

  track: {backgroundColor: c.outlineSoft, overflow: 'hidden', width: '100%'},

  legendItem: {flexDirection: 'row', alignItems: 'center', marginRight: 16},
  legendDot: {width: 8, height: 8, borderRadius: 4, marginRight: 6},
  legendLabel: {fontSize: 13, color: c.textMuted},
  legendValue: {fontSize: 13, color: c.text, fontWeight: '600', marginLeft: 5},

  switchTrack: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.outline,
    padding: 3,
    justifyContent: 'center',
  },
  switchKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchKnobOn: {alignSelf: 'flex-end'},

  langWrap: {
    flexDirection: 'row',
    backgroundColor: c.fill,
    borderRadius: r.pill,
    padding: 3,
  },
  langBtn: {paddingHorizontal: 14, paddingVertical: 5, borderRadius: r.pill},
  langBtnOn: {backgroundColor: c.surface, ...elevation},
  langLabel: {fontSize: 13.5, color: c.textMuted, fontWeight: '600'},

  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: c.outlineSoft,
    backgroundColor: c.surface,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },

  ruleRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 3},
  ruleText: {fontSize: 13, color: c.textMuted, flex: 1},
  empty: {alignItems: 'center', justifyContent: 'center', padding: 40},
  emptyText: {marginTop: 12, textAlign: 'center', color: c.textMuted, fontSize: 14, lineHeight: 20},
});
