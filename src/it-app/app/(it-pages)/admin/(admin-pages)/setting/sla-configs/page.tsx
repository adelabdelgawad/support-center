import { Metadata } from 'next';
import SLAConfigsClient from './_components/sla-configs-client';

export const metadata: Metadata = {
  title: 'SLA Configuration',
  description: 'Manage SLA rules and configurations',
};

export default function SLAConfigsPage() {
  return <SLAConfigsClient />;
}
