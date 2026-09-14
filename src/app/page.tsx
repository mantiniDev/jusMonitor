import { Suspense } from 'react';
import Painel from '@/components/Painel';

export default function Home() {
  // useSearchParams exige fronteira de Suspense na renderização do servidor.
  return (
    <Suspense fallback={<div className="py-16 text-center text-gray-400">Carregando...</div>}>
      <Painel />
    </Suspense>
  );
}
