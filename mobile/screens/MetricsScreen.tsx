/**
 * @module MetricsScreen
 * ISO/IEC 25010 evaluation dashboard — tab "Metrics".
 * Static display only — no logic changes needed.
 */
import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { Colors } from '../constants/Colors';

// ── Data (unchanged from original) ───────────────────────────────────────────

const METRICS = [
  { name: 'Average Sync Latency',     target: '< 50ms',     actual: '1.51ms',     passed: true  },
  { name: 'p95 Latency',              target: '< 50ms',     actual: '3.01ms',     passed: true  },
  { name: 'Max Latency',              target: '< 50ms',     actual: '4.55ms',     passed: true  },
  { name: 'Sync Throughput',          target: '≥ 10 ops/s', actual: '1,010 ops/s',passed: true  },
  { name: 'Conflict Detection Rate',  target: '> 95%',      actual: '100%',        passed: true  },
  { name: 'Data Loss Rate',           target: '0%',         actual: '0%',          passed: true  },
  { name: 'Eventual Consistency',     target: '≥ 95%',      actual: '100%',        passed: true  },
  { name: 'Concurrent Nodes',         target: '15 nodes',   actual: '15 nodes',    passed: true  },
  { name: 'Manual Tests',             target: '20/20',      actual: '100%',        passed: true  },
  { name: 'Automated Tests',          target: '72/72',      actual: '100%',        passed: true  },
];

const HERO_CHIPS = [
  { label: '1.51ms', desc: 'Latency'    },
  { label: '1010/s', desc: 'Throughput' },
  { label: '100%',   desc: 'Consistency'},
  { label: '0%',     desc: 'Data Loss'  },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MetricsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Metrics</Text>
        <Text style={styles.subtitle}>ISO/IEC 25010 Results</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card ── */}
        <View style={styles.heroCard}>
          {/* Big pass number */}
          <Text style={styles.heroNumber}>72 / 72</Text>
          <Text style={styles.heroLabel}>Tests Passed</Text>
          <Text style={styles.heroSub}>100% Pass Rate · All metrics within target</Text>

          {/* Chip row */}
          <View style={styles.chipRow}>
            {HERO_CHIPS.map(c => (
              <View key={c.label} style={styles.chip}>
                <Text style={styles.chipValue}>{c.label}</Text>
                <Text style={styles.chipDesc}>{c.desc}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Section label ── */}
        <Text style={styles.sectionLabel}>Test Results</Text>

        {/* ── Metric rows ── */}
        {METRICS.map(m => (
          <View key={m.name} style={styles.metricCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metricName}>{m.name}</Text>
              <Text style={styles.metricTarget}>Target: {m.target}</Text>
            </View>
            <Text style={styles.metricActual}>{m.actual}</Text>
            <Text style={styles.checkmark}>✓</Text>
          </View>
        ))}

        {/* ── Thesis info card ── */}
        <Text style={styles.sectionLabel}>Thesis Reference</Text>
        <View style={[styles.metricCard, { flexDirection: 'column', gap: 6 }]}>
          {[
            ['Project',     'DocuSync'],
            ['Thesis',      'A Comparative Evaluation of OT and RDTs to Hybrid Conflict Resolution'],
            ['Institution', 'Pamantasan ng Cabuyao — College of Computing Studies'],
            ['Researcher',  'Paul John G. Palamara'],
            ['Methodology', 'Experimental Prototyping (ISO/IEC 25010:2023)'],
            ['Test Suite',  '72 tests — 24 unit + 24 integration + 24 stress'],
          ].map(([label, value]) => (
            <View key={label} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={styles.thesisLabel}>{label}</Text>
              <Text style={styles.thesisValue} numberOfLines={2}>{value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const makeStyles = (themeColors: typeof Colors) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: themeColors.bgBase,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.bgBase,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: themeColors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: themeColors.textMuted,
    marginTop: 2,
  },

  // Hero Card
  heroCard: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: themeColors.borderAccent,
    backgroundColor: themeColors.bgCardHover,
    alignItems: 'center',
  },
  heroNumber: {
    fontSize: 48,
    fontWeight: '800',
    color: themeColors.accent,
    letterSpacing: -1,
  },
  heroLabel: {
    fontSize: 14,
    color: themeColors.textSecondary,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 11,
    color: themeColors.textMuted,
    marginBottom: 20,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.bgBase,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  chipValue: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.accent,
  },
  chipDesc: {
    fontSize: 9,
    color: themeColors.textMuted,
  },

  // Sections
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: themeColors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginLeft: 20,
    marginBottom: 8,
    marginTop: 8,
  },

  // Metric Card
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    backgroundColor: themeColors.bgCard,
  },
  metricName: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textSecondary,
    marginBottom: 2,
  },
  metricTarget: {
    fontSize: 11,
    color: themeColors.textMuted,
  },
  metricActual: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.green,
    fontFamily: 'monospace',
  },
  checkmark: {
    fontSize: 14,
    color: themeColors.green,
    marginLeft: 8,
  },

  // Thesis Metadata
  thesisLabel: {
    width: 80,
    fontSize: 12,
    fontWeight: '600',
    color: themeColors.textMuted,
  },
  thesisValue: {
    flex: 1,
    fontSize: 12,
    color: themeColors.textSecondary,
    lineHeight: 18,
  },
});
