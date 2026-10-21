import Policy from '../../../../components/policy';

export default async function Draft({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Policy slug={slug} draft />;
}
