import Workspace from '../../components/workspace';
export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <Workspace kind="customer">{children}</Workspace>;
}
