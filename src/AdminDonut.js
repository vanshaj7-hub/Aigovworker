import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {ac} from './adminTheme';

/**
 * Ring chart matching the admin dashboard design's donut — built from
 * react-native-svg (already a dependency) rather than a charting library,
 * since this is the only place in the app that needs one. `slices` is
 * `[{name, value, pct, color}]` with `pct` summing to ~100; `centerValue`/
 * `centerUnit` sit in the hole, same as the design's total + "check-ins"/
 * "workers" label.
 */
export default function AdminDonut({slices, centerValue, centerUnit, size = 92}) {
  const strokeWidth = size * 0.17;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;

  return (
    <View style={{width: size, height: size}}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((slice, i) => {
          const pct = Math.max(0, slice.pct || 0);
          const dash = (pct / 100) * circumference;
          const offset = (acc / 100) * circumference;
          acc += pct;
          return (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              fill="none"
              // Rotate so the first slice starts at 12 o'clock, matching the
              // design's conic-gradient starting point.
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
        })}
      </Svg>
      <View style={[StyleSheet.absoluteFill, s.center]}>
        <Text style={s.value}>{centerValue}</Text>
        <Text style={s.unit}>{centerUnit}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: {alignItems: 'center', justifyContent: 'center'},
  value: {fontSize: 18, fontWeight: '500', color: ac.textPrimary, lineHeight: 21},
  unit: {fontSize: 10, color: ac.textSecondary, marginTop: 3},
});
