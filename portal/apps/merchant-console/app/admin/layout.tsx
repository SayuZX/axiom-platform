import Workspace from '../../components/workspace';
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Workspace kind="admin">{children}</Workspace>;
}
