import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Monitor de Tribunais | Indisponibilidade PJe',
  description: 'Painel de monitoramento de indisponibilidade do PJe nos tribunais brasileiros',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
            <span className="text-xl font-bold text-blue-700">⚖</span>
            <span className="text-base font-semibold text-gray-800">JusMonitor</span>
            <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">PJe</span>
          </div>
        </header>
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
