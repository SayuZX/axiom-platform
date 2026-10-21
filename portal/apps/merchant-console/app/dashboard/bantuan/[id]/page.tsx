import SupportPage from '../../../../components/support';

export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SupportPage id={id} />;
}
