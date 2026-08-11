export interface TitleFont {
  id: string;
  label: string;
  jsPdf: 'helvetica' | 'times' | 'courier';
  css: string;
}

export const TITLE_FONTS: TitleFont[] = [
  { id: 'Helvetica', label: 'Helvetica', jsPdf: 'helvetica', css: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'Arial', label: 'Arial', jsPdf: 'helvetica', css: 'Arial, Helvetica, sans-serif' },
  { id: 'Times', label: 'Times', jsPdf: 'times', css: "Georgia, 'Times New Roman', Times, serif" },
  { id: 'Georgia', label: 'Georgia', jsPdf: 'times', css: 'Georgia, serif' },
  { id: 'Palatino', label: 'Palatino', jsPdf: 'times', css: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
  { id: 'Courier', label: 'Courier', jsPdf: 'courier', css: "'Courier New', Courier, monospace" },
];

export function titleFont(id?: string): TitleFont {
  return TITLE_FONTS.find((f) => f.id === id) || TITLE_FONTS[0];
}

export function titleFontCss(id?: string): string {
  return titleFont(id).css;
}

export function titleFontPdf(id?: string): { family: 'helvetica' | 'times' | 'courier'; style: 'normal' | 'bold' } {
  return { family: titleFont(id).jsPdf, style: 'bold' };
}
