import React, {useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from './theme';
import {Icon, TextButton} from './ui';
import {dateKey} from './domain/shifts';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Compact month calendar. Avoids pulling in a native date-picker dependency. */
export default function DatePickerSheet({visible, value, onSelect, onClose, minDate}) {
  const initial = value ? new Date(value) : new Date();
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  // Monday-first offset
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }

  const monthLabel = cursor.toLocaleDateString('en-GB', {month: 'long', year: 'numeric'});
  const shift = n => setCursor(new Date(year, month + n, 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.bg} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.head}>
            <Pressable onPress={() => shift(-1)} hitSlop={12}>
              <Icon name="chevron-left" size={26} color={c.text} />
            </Pressable>
            <Text style={s.month}>{monthLabel}</Text>
            <Pressable onPress={() => shift(1)} hitSlop={12}>
              <Icon name="chevron-right" size={26} color={c.text} />
            </Pressable>
          </View>

          <View style={s.week}>
            {DOW.map((d, i) => (
              <Text key={i} style={s.dow}>
                {d}
              </Text>
            ))}
          </View>

          <View style={s.grid}>
            {cells.map((d, i) => {
              if (!d) {
                return <View key={i} style={s.cell} />;
              }
              const key = dateKey(d);
              const selected = key === value;
              const disabled = minDate && key < minDate;
              return (
                <Pressable
                  key={i}
                  disabled={disabled}
                  onPress={() => onSelect(key)}
                  style={[s.cell, selected && s.cellOn]}>
                  <Text
                    style={[
                      s.cellText,
                      selected && {color: '#fff', fontWeight: '700'},
                      disabled && {color: c.outline},
                    ]}>
                    {d.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextButton label="Close" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: {flex: 1, backgroundColor: '#00000066', justifyContent: 'center', paddingHorizontal: 24},
  sheet: {backgroundColor: c.surface, borderRadius: 20, padding: 18},
  head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10},
  month: {fontSize: 16.5, fontWeight: '600', color: c.text},
  week: {flexDirection: 'row', marginBottom: 4},
  dow: {flex: 1, textAlign: 'center', ...t.small, fontSize: 11.5},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  cellOn: {backgroundColor: c.primary},
  cellText: {fontSize: 14.5, color: c.text},
});
