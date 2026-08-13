import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Toss-inspired light palette
        bg: {
          DEFAULT: '#ffffff',
          secondary: '#f4f5f7',
          tertiary: '#eaecef',
          card: '#ffffff',
        },
        text: {
          primary: '#191f28',
          secondary: '#4e5968',
          tertiary: '#8b95a1',
          placeholder: '#b0b8c1',
        },
        blue: {
          DEFAULT: '#0064FF',
          50: '#f0f7ff',
          100: '#dbeafe',
          500: '#0064FF',
          600: '#0052d4',
        },
        gray: {
          50: '#f9fafb',
          100: '#f4f5f7',
          200: '#eaecef',
          300: '#d1d6db',
          400: '#b0b8c1',
          500: '#8b95a1',
          600: '#6b7684',
          700: '#4e5968',
          800: '#333d4b',
          900: '#191f28',
        },
        green: {
          DEFAULT: '#00c471',
          50: '#ecfdf5',
          500: '#00c471',
        },
        red: {
          DEFAULT: '#f04452',
          50: '#fef2f2',
          500: '#f04452',
        },
        orange: {
          DEFAULT: '#f97316',
          50: '#fff7ed',
        },
        purple: {
          DEFAULT: '#7c3aed',
          50: '#f5f3ff',
        },
      },
      fontFamily: {
        sans: ['Pretendard', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '12px',
        lg: '16px',
        xl: '20px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        elevated: '0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        input: '0 1px 3px rgba(0,0,0,0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
