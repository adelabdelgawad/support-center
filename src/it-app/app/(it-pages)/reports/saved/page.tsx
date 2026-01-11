import { Metadata } from 'next';
import SavedReportsClient from './_components/saved-reports-client';

export const metadata: Metadata = {
  title: 'Saved Reports',
  description: 'Manage saved report configurations',
};

export default function SavedReportsPage() {
  return <SavedReportsClient />;
}
