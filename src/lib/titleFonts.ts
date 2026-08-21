import { PLACE_NAME_FONTS } from './placeNameFonts';

export interface TitleFont {
  id: string;
  label: string;
  jsPdf: 'helvetica' | 'times' | 'courier';
  css: string;
}

function pdfFamilyFor(id: string): 'helvetica' | 'times' | 'courier' {
  const sans = ['Inter', 'Roboto', 'Open Sans', 'Noto Sans', 'Lato', 'Montserrat', 'Poppins', 'Work Sans'];
  const serif = ['Noto Serif', 'Merriweather', 'Lora', 'Playfair Display', 'PT Serif', 'Source Serif 4', 'Spectral', 'EB Garamond'];
  const mono = ['Roboto Mono', 'Space Mono'];
  if (sans.includes(id)) return 'helvetica';
  if (serif.includes(id)) return 'times';
  if (mono.includes(id)) return 'courier';
  return 'helvetica';
}

export const LAYOUT_FONTS: TitleFont[] = [
  ...PLACE_NAME_FONTS.map((f) => ({
    id: f.id,
    label: f.label,
    jsPdf: pdfFamilyFor(f.id),
    css: f.css,
  })),
  { id: 'Helvetica', label: 'Helvetica', jsPdf: 'helvetica', css: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'Arial', label: 'Arial', jsPdf: 'helvetica', css: 'Arial, Helvetica, sans-serif' },
  { id: 'Times', label: 'Times', jsPdf: 'times', css: "Georgia, 'Times New Roman', Times, serif" },
  { id: 'Georgia', label: 'Georgia', jsPdf: 'times', css: 'Georgia, serif' },
  { id: 'Palatino', label: 'Palatino', jsPdf: 'times', css: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { id: 'Courier', label: 'Courier', jsPdf: 'courier', css: "'Courier New', Courier, monospace" },
];

export function titleFont(id?: string): TitleFont {
  return LAYOUT_FONTS.find((f) => f.id === id) || LAYOUT_FONTS[0];
}

export function titleFontCss(id?: string): string {
  return titleFont(id).css;
}

export function titleFontPdf(id?: string): { family: 'helvetica' | 'times' | 'courier'; style: 'normal' | 'bold' } {
  const font = titleFont(id);
  return { family: font.jsPdf, style: 'bold' };
}
