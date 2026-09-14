import { redirect } from 'next/navigation';

/** O registro passou a viver como aba do painel único; o endereço antigo segue valendo. */
export default function IncidentesPage() {
  redirect('/?aba=incidentes');
}
