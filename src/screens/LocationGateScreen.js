import React from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {Banner, BottomBar, FilledButton, Icon, OutlinedButton, Screen, TextButton} from '../ui';
import {formatDistance} from '../domain/geo';

/**
 * Runs once after sign-in. The supervisor cannot use the app until the device
 * is inside the ward the IT Administrator assigned to them.
 */
export default function LocationGateScreen({ward, fence, checking, onRetry, onRecentre, onSkip, onSignOut}) {
  const {t: tr} = useLang();

  if (checking) {
    return (
      <Screen bg={c.surface} style={s.center}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={s.checkTitle}>{tr('locationCheckTitle')}</Text>
        <Text style={s.checkBody}>{tr('locationCheckBody')}</Text>
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <ScrollView contentContainerStyle={{paddingBottom: 10}}>
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Icon name="wrong-location" size={32} color="#fff" />
          </View>
          <Text style={s.heroTitle}>{tr('locationBlockedTitle')}</Text>
          <Text style={s.heroSub}>{tr('locationBlockedBody', {ward: ward.name})}</Text>
        </View>

        <View style={s.body}>
          <View style={s.stat}>
            <Icon name="straighten" size={20} color={c.textMuted} style={{marginRight: 12}} />
            <Text style={[t.body, {flex: 1}]}>
              {fence.position
                ? tr('distanceOutside', {d: formatDistance(fence.overshoot)})
                : tr('accuracySearching')}
            </Text>
          </View>

          <Banner
            tone="warning"
            icon="warning-amber"
            body={tr('absentWarning')}
            style={{marginTop: 14}}
          />

          <View style={s.steps}>
            <Text style={[t.label, {marginBottom: 12}]}>{tr('whatToDo')}</Text>
            {[tr('step1'), tr('step2')].map((line, i) => (
              <View key={i} style={s.stepRow}>
                <Text style={s.stepNum}>{i + 1}.</Text>
                <Text style={[t.body, {flex: 1, lineHeight: 21}]}>{line}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <BottomBar>
        <FilledButton label={tr('checkAgain')} icon="refresh" onPress={onRetry} />
        {onRecentre ? (
          <>
            <OutlinedButton
              label={tr('recentreWard')}
              onPress={onRecentre}
              style={{marginTop: 10}}
            />
            <Text style={s.note}>{tr('recentreNote')}</Text>
          </>
        ) : null}
        {onSkip ? (
          <>
            <TextButton label={tr('skipLocation')} onPress={onSkip} style={{marginTop: 12}} />
            <Text style={s.note}>{tr('skipLocationNote')}</Text>
          </>
        ) : null}
        <Text style={s.signOut} onPress={onSignOut}>
          {tr('signOut')}
        </Text>
      </BottomBar>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: {alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40},
  checkTitle: {fontSize: 19, fontWeight: '600', color: c.text, marginTop: 24, textAlign: 'center'},
  checkBody: {...t.bodyMuted, marginTop: 8, textAlign: 'center', lineHeight: 20},

  hero: {backgroundColor: c.errorContainer, alignItems: 'center', paddingVertical: 30, paddingHorizontal: 26},
  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: c.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {fontSize: 23, fontWeight: '600', color: c.onErrorContainer, marginTop: 16, textAlign: 'center'},
  heroSub: {fontSize: 14, color: c.onErrorContainer, marginTop: 8, textAlign: 'center', lineHeight: 20},

  body: {padding: 20},
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bg,
    borderRadius: r.card,
    padding: 14,
  },
  steps: {marginTop: 16, borderWidth: 1, borderColor: c.outlineSoft, borderRadius: r.card, padding: 16},
  stepRow: {flexDirection: 'row', marginBottom: 10},
  stepNum: {color: c.primaryDark, fontWeight: '600', width: 22, fontSize: 14},
  note: {...t.small, textAlign: 'center', marginTop: 10, lineHeight: 17},
  signOut: {color: c.primaryDark, fontSize: 14.5, fontWeight: '600', textAlign: 'center', paddingTop: 16},
});
