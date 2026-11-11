const PATHS: Record<string, string> = {
  layout: 'M3 3h18v18H3z M3 9h18 M9 9v12',
  shapes: 'M7 3l5 8H2z M13 14h8v7h-8z M7 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M17.5 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  text: 'M4 6V4h16v2 M12 4v16 M8 20h8',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  photo: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15.5 9.5a1.5 1.5 0 1 0 0 .01',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 2-1 3-1a4 4 0 0 0 4-4c0-4.5-4-8-9-8z M7.5 11a1 1 0 1 0 0 .01 M10 7a1 1 0 1 0 0 .01 M15 7.5a1 1 0 1 0 0 .01',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5 M3 17l9 5 9-5',
  undo: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5 M20 9H9a5 5 0 0 0 0 10h3',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 7.5-2',
  up: 'M12 19V5 M5 12l7-7 7 7',
  down: 'M12 5v14 M5 12l7 7 7-7',
  alignLeft: 'M4 3v18 M8 7h10v4H8z M8 14h6v4H8z',
  alignCenterH: 'M12 3v18 M6 7h12v4H6z M8 14h8v4H8z',
  alignRight: 'M20 3v18 M6 7h10v4H6z M10 14h6v4h-6z',
  alignTop: 'M3 4h18 M7 8h4v10H7z M14 8h4v6h-4z',
  alignCenterV: 'M3 12h18 M7 6h4v12H7z M14 8h4v8h-4z',
  alignBottom: 'M3 20h18 M7 6h4v10H7z M14 10h4v6h-4z',
  textLeft: 'M4 6h16 M4 10h10 M4 14h16 M4 18h10',
  textCenter: 'M4 6h16 M7 10h10 M4 14h16 M7 18h10',
  textRight: 'M4 6h16 M10 10h10 M4 14h16 M10 18h10',
  folder: 'M3 6h6l2 2h10v11H3z',
  plus: 'M12 5v14 M5 12h14',
  resize: 'M4 9V4h5 M20 15v5h-5 M4 4l7 7 M20 20l-7-7',
  flipH: 'M12 3v18 M8 7L3 12l5 5z M16 7l5 5-5 5z',
  flipV: 'M3 12h18 M7 8l5-5 5 5z M7 16l5 5 5-5z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-5-5',
  check: 'M5 12l5 5 9-10',
  logout: 'M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  x: 'M6 6l12 12 M18 6L6 18',
  minus: 'M5 12h14'
};

export default function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  );
}
