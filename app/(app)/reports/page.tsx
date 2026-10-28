import { redirect } from 'next/navigation';

// Reports opens on its first tab (M09).
export default function Reports() {
  redirect('/reports/ce');
}
