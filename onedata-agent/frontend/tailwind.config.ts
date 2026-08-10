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
        ink: {
          900: '#06121a',
          800: '#0d1f2d',
          700: '#152a3a',
          600: '#1e3a4f',
        },
        pearl: '#f0f6f4',
        mist: '#8ba4b0',
        slate: '#5a7a8a',
        jade: '#3dd68c',
        aqua: '#38c7e0',
        coral: '#ff6b6b',
        amber: '#f5a623',
        flow: {
          DEFAULT: 'rgba(56,199,224,0.15)',
          solid: '#38c7e0',
        },
      },
      fontFamily: {
        display: ['Pretendard', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        md: '10px',
        pill: '9999px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 8px rgba(56,199,224,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(56,199,224,0.6)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
