/**
 * Candidate color schemes for the theme-switcher (Settings → Appearance).
 * Every scheme was generated with tastemaker's `generate_palette.py` —
 * real OKLCH color-harmony math with a verified contrast matrix, not
 * hand-picked hex values — same method used for the shipped default
 * ("Civic Green"). Light/dark pairs share a seed so they're a genuine
 * companion pair, not two coincidentally-similar runs.
 *
 * Each role set: text, bg, surface, primary, onPrimary, accent, border.
 * `deriveScale()` (see lib/color.js) expands primary/accent into full
 * tonal ramps at apply-time — schemes only need the five anchor colors.
 */
export const SCHEMES = [
  {
    id: 'civic-green',
    name: 'Civic Green',
    mood: 'Technical · shipped default',
    light: { text: '#151d16', bg: '#f2faf3', surface: '#e8f0e9', border: '#d8dfd9', primary: '#37844f', onPrimary: '#ffffff', accent: '#8063ab' },
    dark: { text: '#eaf5ec', bg: '#070c08', surface: '#111713', border: '#1d231e', primary: '#37844f', onPrimary: '#ffffff', accent: '#ab8dd9' },
  },
  {
    id: 'ocean-slate',
    name: 'Ocean Slate',
    mood: 'Technical',
    light: { text: '#141b23', bg: '#f8fbff', surface: '#ebf2f9', border: '#dbe1e8', primary: '#2e75b5', onPrimary: '#ffffff', accent: '#b35568' },
    dark: { text: '#e9f3fe', bg: '#0e1317', surface: '#191e23', border: '#252a2f', primary: '#3178b9', onPrimary: '#ffffff', accent: '#df7c8e' },
  },
  {
    id: 'harbor-teal',
    name: 'Harbor Teal',
    mood: 'Technical',
    light: { text: '#111c21', bg: '#f7fdff', surface: '#e9f3f8', border: '#d9e3e7', primary: '#0e7d9d', onPrimary: '#ffffff', accent: '#ac603e' },
    dark: { text: '#e6f5fb', bg: '#0d1417', surface: '#192023', border: '#242c2f', primary: '#1580a1', onPrimary: '#ffffff', accent: '#d78864' },
  },
  {
    id: 'indigo-dusk',
    name: 'Indigo Dusk',
    mood: 'Premium',
    light: { text: '#191a23', bg: '#fafbff', surface: '#eff0f9', border: '#dfe0e9', primary: '#6366bf', onPrimary: '#ffffff', accent: '#b95633' },
    dark: { text: '#eff1fe', bg: '#111218', surface: '#1c1d23', border: '#282930', primary: '#686cc6', onPrimary: '#ffffff', accent: '#e57e5a' },
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    mood: 'Premium',
    light: { text: '#141c23', bg: '#f2f8ff', surface: '#e7eff5', border: '#d7dee5', primary: '#2377b5', onPrimary: '#ffffff', accent: '#b1563e' },
    dark: { text: '#e8f3fe', bg: '#070b0f', surface: '#11161b', border: '#1c2226', primary: '#277ab9', onPrimary: '#ffffff', accent: '#e08067' },
  },
  {
    id: 'royal-denim',
    name: 'Royal Denim',
    mood: 'Premium',
    light: { text: '#151b23', bg: '#f9fcff', surface: '#edf2fa', border: '#dce1e9', primary: '#4271b7', onPrimary: '#ffffff', accent: '#986b10' },
    dark: { text: '#eaf2fe', bg: '#101319', surface: '#1b1f24', border: '#272b31', primary: '#4877be', onPrimary: '#ffffff', accent: '#c8943a' },
  },
  {
    id: 'orchid-pop',
    name: 'Orchid Pop',
    mood: 'Playful',
    light: { text: '#1d1821', bg: '#fdfaff', surface: '#f4eff7', border: '#e3dee6', primary: '#9546c0', onPrimary: '#ffffff', accent: '#9e670f' },
    dark: { text: '#f6effb', bg: '#141116', surface: '#1f1c22', border: '#2b282e', primary: '#a253ce', onPrimary: '#ffffff', accent: '#d68c09' },
  },
  {
    id: 'cherry-mint',
    name: 'Cherry Mint',
    mood: 'Playful',
    light: { text: '#221719', bg: '#fff5f6', surface: '#f5eaec', border: '#e5dadb', primary: '#bf385c', onPrimary: '#ffffff', accent: '#197f53' },
    dark: { text: '#feedef', bg: '#0f0909', surface: '#1a1314', border: '#261f20', primary: '#ca4265', onPrimary: '#ffffff', accent: '#11bb79' },
  },
  {
    id: 'lime-violet',
    name: 'Lime Violet',
    mood: 'Playful',
    light: { text: '#1a1c12', bg: '#fbfdf4', surface: '#f1f3ea', border: '#e0e2d9', primary: '#6d7a14', onPrimary: '#ffffff', accent: '#845ccc' },
    dark: { text: '#f1f4e6', bg: '#13140e', surface: '#1e1f19', border: '#2a2b25', primary: '#707d19', onPrimary: '#ffffff', accent: '#ab84f8' },
  },
  {
    id: 'olive-bronze',
    name: 'Olive Bronze',
    mood: 'Elegant',
    light: { text: '#1e1a11', bg: '#fefbf2', surface: '#f4f1e8', border: '#e4e0d8', primary: '#846f3d', onPrimary: '#ffffff', accent: '#357e87' },
    dark: { text: '#f7f1e5', bg: '#14120c', surface: '#201d17', border: '#2c2923', primary: '#877240', onPrimary: '#ffffff', accent: '#65abb6' },
  },
  {
    id: 'terracotta-sage',
    name: 'Terracotta Sage',
    mood: 'Elegant',
    light: { text: '#221717', bg: '#fff5f4', surface: '#f6ebea', border: '#e5dada', primary: '#936362', onPrimary: '#ffffff', accent: '#477b6a' },
    dark: { text: '#feeded', bg: '#0f0908', surface: '#1b1313', border: '#261f1e', primary: '#996968', onPrimary: '#ffffff', accent: '#77ab99' },
  },
  {
    id: 'sand-slate',
    name: 'Sand Slate',
    mood: 'Elegant',
    light: { text: '#1f1a11', bg: '#fffbf5', surface: '#f6f1e9', border: '#e6e0d8', primary: '#866d49', onPrimary: '#ffffff', accent: '#5e7698' },
    dark: { text: '#f9f0e5', bg: '#16120d', surface: '#221e18', border: '#2e2a24', primary: '#89704c', onPrimary: '#ffffff', accent: '#87a0c4' },
  },
  {
    id: 'amber-jade',
    name: 'Amber Jade',
    mood: 'Warm',
    light: { text: '#211813', bg: '#fffaf7', surface: '#f8efea', border: '#e7dfd9', primary: '#a15f2e', onPrimary: '#ffffff', accent: '#10816b' },
    dark: { text: '#fcefe7', bg: '#17110d', surface: '#221c18', border: '#2e2824', primary: '#a76534', onPrimary: '#ffffff', accent: '#47b49a' },
  },
  {
    id: 'rosewood',
    name: 'Rosewood',
    mood: 'Warm',
    light: { text: '#221717', bg: '#fff5f4', surface: '#f6ebea', border: '#e5dada', primary: '#a25a59', onPrimary: '#ffffff', accent: '#228067' },
    dark: { text: '#feeded', bg: '#0f0908', surface: '#1b1313', border: '#261f1e', primary: '#ab6262', onPrimary: '#ffffff', accent: '#5ab297' },
  },
  {
    id: 'clay-teal',
    name: 'Clay Teal',
    mood: 'Warm',
    light: { text: '#221815', bg: '#fffaf9', surface: '#f9efec', border: '#e9dedc', primary: '#a05d4e', onPrimary: '#ffffff', accent: '#157f91' },
    dark: { text: '#feeeea', bg: '#181110', surface: '#241d1b', border: '#302927', primary: '#a66254', onPrimary: '#ffffff', accent: '#51adc0' },
  },
];

export const DEFAULT_SCHEME_ID = 'civic-green';
