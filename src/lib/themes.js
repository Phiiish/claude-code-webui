const THEMES = {
  dark: {
    terminal: { background:'#12122a',foreground:'#e4e4e8',cursor:'#6366f1',cursorAccent:'#12122a',
      selectionBackground:'rgba(99,102,241,0.35)',black:'#1a1b2e',red:'#ff5370',green:'#c3e88d',
      yellow:'#ffcb6b',blue:'#82aaff',magenta:'#c792ea',cyan:'#89ddff',white:'#e4e4e8',
      brightBlack:'#545480',brightRed:'#ff5370',brightGreen:'#c3e88d',brightYellow:'#ffcb6b',
      brightBlue:'#82aaff',brightMagenta:'#c792ea',brightCyan:'#89ddff',brightWhite:'#ffffff' },
  },
  light: {
    terminal: { background:'#ffffff',foreground:'#1e293b',cursor:'#6366f1',cursorAccent:'#ffffff',
      selectionBackground:'rgba(99,102,241,0.2)',black:'#000000',red:'#dc2626',green:'#16a34a',
      yellow:'#ca8a04',blue:'#2563eb',magenta:'#9333ea',cyan:'#0891b2',white:'#f1f5f9',
      brightBlack:'#64748b',brightRed:'#ef4444',brightGreen:'#22c55e',brightYellow:'#eab308',
      brightBlue:'#3b82f6',brightMagenta:'#a855f7',brightCyan:'#06b6d4',brightWhite:'#ffffff' },
  },
  dracula: {
    terminal: { background:'#282a36',foreground:'#f8f8f2',cursor:'#bd93f9',cursorAccent:'#282a36',
      selectionBackground:'rgba(189,147,249,0.3)',black:'#21222c',red:'#ff5555',green:'#50fa7b',
      yellow:'#f1fa8c',blue:'#6272a4',magenta:'#ff79c6',cyan:'#8be9fd',white:'#f8f8f2',
      brightBlack:'#6272a4',brightRed:'#ff6e6e',brightGreen:'#69ff94',brightYellow:'#ffffa5',
      brightBlue:'#d6acff',brightMagenta:'#ff92df',brightCyan:'#a4ffff',brightWhite:'#ffffff' },
  },
  nord: {
    terminal: { background:'#2e3440',foreground:'#eceff4',cursor:'#88c0d0',cursorAccent:'#2e3440',
      selectionBackground:'rgba(136,192,208,0.3)',black:'#3b4252',red:'#bf616a',green:'#a3be8c',
      yellow:'#ebcb8b',blue:'#81a1c1',magenta:'#b48ead',cyan:'#88c0d0',white:'#e5e9f0',
      brightBlack:'#4c566a',brightRed:'#bf616a',brightGreen:'#a3be8c',brightYellow:'#ebcb8b',
      brightBlue:'#81a1c1',brightMagenta:'#b48ead',brightCyan:'#8fbcbb',brightWhite:'#eceff4' },
  },
  solarized: {
    terminal: { background:'#002b36',foreground:'#fdf6e3',cursor:'#268bd2',cursorAccent:'#002b36',
      selectionBackground:'rgba(38,139,210,0.3)',black:'#073642',red:'#dc322f',green:'#859900',
      yellow:'#b58900',blue:'#268bd2',magenta:'#d33682',cyan:'#2aa198',white:'#eee8d5',
      brightBlack:'#586e75',brightRed:'#cb4b16',brightGreen:'#859900',brightYellow:'#b58900',
      brightBlue:'#268bd2',brightMagenta:'#6c71c4',brightCyan:'#2aa198',brightWhite:'#fdf6e3' },
  },
  monokai: {
    terminal: { background:'#272822',foreground:'#f8f8f2',cursor:'#f8f8f0',cursorAccent:'#272822',
      selectionBackground:'rgba(166,226,46,0.2)',black:'#272822',red:'#f92672',green:'#a6e22e',
      yellow:'#e6db74',blue:'#66d9ef',magenta:'#ae81ff',cyan:'#a1efe4',white:'#f8f8f2',
      brightBlack:'#75715e',brightRed:'#f92672',brightGreen:'#a6e22e',brightYellow:'#e6db74',
      brightBlue:'#66d9ef',brightMagenta:'#ae81ff',brightCyan:'#a1efe4',brightWhite:'#f9f8f5' },
  },
};

class ThemeManager {
  constructor() {
    this.current = localStorage.getItem('theme') || 'dark';
    this.apply(this.current);
  }
  apply(name) {
    this.current = name;
    document.documentElement.setAttribute('data-theme', name);
    localStorage.setItem('theme', name);
    const sel = document.getElementById('theme-select');
    if (sel) sel.value = name;
  }
  getTerminalTheme() { return THEMES[this.current]?.terminal || THEMES.dark.terminal; }
}

export { THEMES, ThemeManager };
