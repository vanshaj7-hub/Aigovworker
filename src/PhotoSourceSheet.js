import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {c, t} from './theme';
import {useLang} from './i18n';
import {Icon} from './ui';

/** Lets the officer take a new photo or pick an existing one from the gallery. */
export default function PhotoSourceSheet({visible, title, onCamera, onGallery, onClose}) {
  const {t: tr} = useLang();
  const rows = [
    {key: 'cam', icon: 'photo-camera', label: tr('takePhoto'), run: onCamera},
    {key: 'gal', icon: 'photo-library', label: tr('chooseFromGallery'), run: onGallery},
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.bg} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={[t.label, {marginBottom: 6}]}>{title || tr('photoSource')}</Text>
          {rows.map(row => (
            <Pressable
              key={row.key}
              onPress={() => {
                onClose();
                row.run();
              }}
              android_ripple={{color: '#00000010'}}
              style={s.row}>
              <View style={s.iconWrap}>
                <Icon name={row.icon} size={22} color={c.primaryDark} />
              </View>
              <Text style={s.label}>{row.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={s.cancel} hitSlop={8}>
            <Text style={s.cancelText}>{tr('cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: {flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: 14},
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  label: {fontSize: 16, color: c.text, fontWeight: '500'},
  cancel: {alignItems: 'center', paddingVertical: 14},
  cancelText: {color: c.primaryDark, fontSize: 15, fontWeight: '600'},
});
