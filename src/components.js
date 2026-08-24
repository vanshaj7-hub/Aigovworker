import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {colors} from './theme';

export function Screen({children, style}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Header({title, subtitle, onBack, right}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>{'←'}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={{flex: 1}}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Button({title, onPress, variant = 'primary', disabled, busy, style}) {
  const bg =
    variant === 'danger'
      ? colors.danger
      : variant === 'secondary'
      ? colors.card
      : colors.primary;
  const fg = variant === 'secondary' ? colors.primary : '#fff';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        styles.btn,
        {backgroundColor: bg, opacity: disabled || busy ? 0.55 : 1},
        variant === 'secondary' && styles.btnOutline,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.btnTxt, {color: fg}]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Field({label, ...props}) {
  return (
    <View style={{marginBottom: 14}}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function Card({children, style}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({text, color}) {
  return (
    <View style={[styles.badge, {backgroundColor: color + '22', borderColor: color}]}>
      <Text style={{color, fontSize: 11, fontWeight: '700'}}>{text}</Text>
    </View>
  );
}

export function EmptyState({text}) {
  return (
    <View style={{alignItems: 'center', padding: 40}}>
      <Text style={{color: colors.textMuted, textAlign: 'center'}}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bg},
  header: {
    backgroundColor: colors.primary,
    paddingTop: 44,
    paddingBottom: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {marginRight: 12, padding: 4},
  backTxt: {color: '#fff', fontSize: 22, fontWeight: '700'},
  headerTitle: {color: '#fff', fontSize: 19, fontWeight: '700'},
  headerSub: {color: '#cfe3d4', fontSize: 12, marginTop: 2},
  btn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: {borderWidth: 1.5, borderColor: colors.primary},
  btnTxt: {fontSize: 15, fontWeight: '700'},
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
});
