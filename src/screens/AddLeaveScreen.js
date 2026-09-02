import React, {useState} from 'react';
import {Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {useLang} from '../i18n';
import {
  AppBar,
  Avatar,
  Banner,
  BottomBar,
  Divider,
  Field,
  FilledButton,
  FilterChip,
  Icon,
  Screen,
  SectionLabel,
  Switch,
} from '../ui';
import {addLeave} from '../storage';
import {dateKey} from '../domain/shifts';
import DatePickerSheet from '../DatePickerSheet';

const TYPES = [
  {key: 'casual', label: 'casual'},
  {key: 'sick', label: 'sick'},
  {key: 'unpaid', label: 'unpaid'},
];

const pretty = key => {
  if (!key) {
    return '';
  }
  const d = new Date(key + 'T00:00:00');
  return d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
};

export default function AddLeaveScreen({workers, onSaved, onBack, preselect}) {
  const {t: tr} = useLang();
  const today = dateKey(new Date());
  const [worker, setWorker] = useState(preselect || null);
  const [type, setType] = useState('casual');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [bothShifts, setBothShifts] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dateTarget, setDateTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!worker) {
      Alert.alert(tr('addLeave'), tr('selectWorker'));
      return;
    }
    setBusy(true);
    try {
      const range = from <= to ? {from, to} : {from: to, to: from};
      const {leaves} = await addLeave({
        workerId: worker.id,
        workerName: worker.name,
        type,
        ...range,
        bothShifts,
        shift: bothShifts ? null : 1,
        remarks: remarks.trim(),
      });
      onSaved(leaves, worker);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen bg={c.surface}>
      <AppBar title={tr('addLeave')} onBack={onBack} />
      <Divider />
      <ScrollView contentContainerStyle={{paddingBottom: 20}} keyboardShouldPersistTaps="handled">
        <SectionLabel>{tr('worker')}</SectionLabel>
        <Pressable onPress={() => setPickerOpen(true)} style={s.workerCard}>
          {worker ? (
            <>
              <Avatar name={worker.name} uri={worker.photoUri} size={44} />
              <View style={{flex: 1, marginLeft: 14}}>
                <Text style={s.workerName}>{worker.name}</Text>
                <Text style={t.small}>
                  {worker.designation} · {worker.code}
                </Text>
              </View>
            </>
          ) : (
            <Text style={[t.bodyMuted, {flex: 1, fontSize: 15}]}>{tr('selectWorker')}</Text>
          )}
          <Icon name="expand-more" size={24} />
        </Pressable>

        <SectionLabel>{tr('leaveType')}</SectionLabel>
        <View style={s.chipRow}>
          {TYPES.map(x => (
            <FilterChip
              key={x.key}
              label={tr(x.label)}
              selected={type === x.key}
              onPress={() => setType(x.key)}
            />
          ))}
        </View>

        <View style={s.dateRow}>
          <Field
            label={tr('fromDate')}
            value={pretty(from)}
            onPress={() => setDateTarget('from')}
            right={<Icon name="event" size={20} />}
            style={{flex: 1, marginRight: 12}}
          />
          <Field
            label={tr('toDate')}
            value={pretty(to)}
            onPress={() => setDateTarget('to')}
            right={<Icon name="event" size={20} />}
            style={{flex: 1}}
          />
        </View>

        <View style={s.toggleCard}>
          <View style={{flex: 1}}>
            <Text style={s.toggleTitle}>{tr('applyBothShifts')}</Text>
            <Text style={t.small}>{tr('bothShiftsSub')}</Text>
          </View>
          <Switch value={bothShifts} onValueChange={setBothShifts} />
        </View>

        <View style={{paddingHorizontal: 16, marginTop: 18}}>
          <Field label={tr('remarks')} value={remarks} onChangeText={setRemarks} multiline />
          <Banner tone="info" icon="info-outline" body={tr('leaveNote')} />
        </View>
      </ScrollView>

      <BottomBar>
        <FilledButton label={tr('saveLeave')} onPress={save} busy={busy} />
      </BottomBar>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setPickerOpen(false)}>
          <View style={s.sheet}>
            <Text style={[t.label, {marginBottom: 6}]}>{tr('selectWorker')}</Text>
            <ScrollView style={{maxHeight: 380}}>
              {workers.map(w => (
                <Pressable
                  key={w.id}
                  onPress={() => {
                    setWorker(w);
                    setPickerOpen(false);
                  }}
                  style={s.sheetRow}>
                  <Avatar name={w.name} uri={w.photoUri} size={38} />
                  <View style={{flex: 1, marginLeft: 12}}>
                    <Text style={[t.body, {fontSize: 15.5, fontWeight: '600'}]}>{w.name}</Text>
                    <Text style={t.small}>{w.code}</Text>
                  </View>
                  {worker && worker.id === w.id ? (
                    <Icon name="check" size={20} color={c.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <DatePickerSheet
        visible={!!dateTarget}
        value={dateTarget === 'to' ? to : from}
        minDate={dateTarget === 'to' ? from : undefined}
        onSelect={key => {
          if (dateTarget === 'to') {
            setTo(key);
          } else {
            setFrom(key);
            if (to < key) {
              setTo(key);
            }
          }
          setDateTarget(null);
        }}
        onClose={() => setDateTarget(null)}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  workerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: r.card,
    padding: 14,
  },
  workerName: {fontSize: 16, fontWeight: '600', color: c.text},
  chipRow: {flexDirection: 'row', paddingHorizontal: 16, marginBottom: 20},
  dateRow: {flexDirection: 'row', paddingHorizontal: 16},
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: c.outline,
    borderRadius: r.card,
    padding: 16,
  },
  toggleTitle: {fontSize: 15.5, fontWeight: '600', color: c.text},
  modalBg: {flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end'},
  sheet: {backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20},
  sheetRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12},
});
