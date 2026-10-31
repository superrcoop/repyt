import './globals.css';

export const metadata = {
  title: 'Repyt × Saltwake | Tales of the Open Sea Word Game',
  description: 'A storybook pirate voyage and daily semantic treasure hunt with live voice controls and speech teaching.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
