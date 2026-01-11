export const metadata = {
  title: 'Access Denied',
  description: 'You do not have permission to access this page',
};

export default function NotAuthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
