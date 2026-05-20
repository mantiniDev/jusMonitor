import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        available: { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
        unavailable: { bg: '#fee2e2', text: '#991b1b', dot: '#dc2626' },
        checking: { bg: '#dbeafe', text: '#1e40af', dot: '#2563eb' },
        error: { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },
        unknown: { bg: '#f3f4f6', text: '#374151', dot: '#6b7280' },
      },
    },
  },
  plugins: [],
};

export default config;
