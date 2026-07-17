/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Cool off-white, not the generic warm cream — this is an
        // instrument panel, meant to feel precise rather than cozy.
        canvas: '#F5F7F7',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#131A1C',
          soft: '#4B5B5E',
          faint: '#8A9A9D',
        },
        line: '#E1E7E7',
        accent: {
          DEFAULT: '#1B6B76', // deep teal — water/irrigation domain
          soft: '#E4F0F1',
          strong: '#0E4A53',
        },
        ok: {
          DEFAULT: '#1F8B5B',
          soft: '#E4F5EC',
        },
        warn: {
          DEFAULT: '#B8790F',
          soft: '#FBF0DC',
        },
        danger: {
          DEFAULT: '#B23B3B',
          soft: '#FBEAEA',
        },
      },
      fontFamily: {
        display: ['"Sora"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '14px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(19, 26, 28, 0.04), 0 1px 12px rgba(19, 26, 28, 0.03)',
      },
    },
  },
  plugins: [],
};
