import React, {useEffect, useState} from 'react';
import {Image, ScrollView, StyleSheet, Text, View} from 'react-native';
import {c, r, t} from '../theme';
import {AppBar, Divider, EmptyState, Screen} from '../ui';
import {getLastMatchDebug} from '../storage';

/**
 * Shows the exact 112x112 aligned face crops (post-detection, post-alignment
 * — the literal pixels the model scored, not the raw photos) from the most
 * recent attendance match attempt, live capture next to reference, with the
 * score. Purely a read-only diagnostic view of data FaceEmbedModule.kt/App.js
 * already write on every attempt; it has no effect on matching itself.
 *
 * Point of this screen: a reported "impostor match too high" is otherwise
 * unverifiable without seeing what actually went into the model — a bad
 * crop/alignment looks identical to a bad threshold from the score alone.
 */
export default function DebugFacesScreen({onBack}) {
  const [entry, setEntry] = useState(undefined); // undefined = loading, null = none yet

  useEffect(() => {
    let alive = true;
    getLastMatchDebug().then(e => {
      if (alive) {
        setEntry(e);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Screen bg={c.surface}>
      <AppBar title="Debug: last match faces" onBack={onBack} />
      <Divider />
      <ScrollView contentContainerStyle={{padding: 16, paddingBottom: 24}}>
        {entry === undefined ? null : !entry ? (
          <EmptyState icon="face" text="No attendance match attempt recorded yet this install." />
        ) : (
          <>
            <Text style={s.title}>{entry.workerName}</Text>
            <Text style={s.score}>Score: {Math.round((entry.score || 0) * 100)}%</Text>
            <Text style={t.small}>{entry.at ? new Date(entry.at).toLocaleString() : ''}</Text>

            <View style={s.row}>
              <View style={s.col}>
                <Text style={s.label}>Live capture (aligned)</Text>
                {entry.liveUri ? (
                  <Image source={{uri: entry.liveUri}} style={s.img} resizeMode="cover" />
                ) : (
                  <View style={[s.img, s.imgMissing]}>
                    <Text style={t.small}>not saved</Text>
                  </View>
                )}
              </View>
              <View style={s.col}>
                <Text style={s.label}>Reference (aligned)</Text>
                {entry.referenceUri ? (
                  <Image source={{uri: entry.referenceUri}} style={s.img} resizeMode="cover" />
                ) : (
                  <View style={[s.img, s.imgMissing]}>
                    <Text style={t.small}>not saved (was cached, not recomputed this attempt)</Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={[t.small, {marginTop: 16}]}>
              These are exactly the 112x112 pixels handed to the face-matching model, after face
              detection and alignment — not the original photos. If either image looks wrong (wrong
              region, no face, badly warped), that points at detection/alignment rather than the
              match threshold.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: {fontSize: 18, fontWeight: '700', color: c.text},
  score: {fontSize: 22, fontWeight: '700', color: c.text, marginTop: 4},
  row: {flexDirection: 'row', marginTop: 20, gap: 12},
  col: {flex: 1, alignItems: 'center'},
  label: {...t.small, marginBottom: 8, textAlign: 'center'},
  img: {
    width: 160,
    height: 160,
    borderRadius: r.card,
    borderWidth: 1,
    borderColor: c.outlineSoft,
    backgroundColor: c.fill,
  },
  imgMissing: {alignItems: 'center', justifyContent: 'center', padding: 8},
});
