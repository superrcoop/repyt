import './globals.css';

export const metadata = {
  title: 'Repyt | AI Semantic Word Odyssey',
  description: 'Embark on a daily semantic concept voyage. Test your bearing, practice speech, and unlock the Repyt Vault before your ship vanishes.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
