export const metadata = {
  title: 'Unauthorized',
  description: 'Insufficient privileges to access this page',
};

export default function UnauthorizedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
