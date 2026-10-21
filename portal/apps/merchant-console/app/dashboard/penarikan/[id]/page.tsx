import WithdrawalDetail from '../../../../components/withdrawal-detail';
export default async function Withdrawal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WithdrawalDetail id={id} />;
}
