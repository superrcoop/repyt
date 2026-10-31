import './globals.css';

export const metadata = {
  title: 'Repyt × Saltwake | Tales of the Open Sea Word Game',
  description: 'A storybook pirate word association rally and daily semantic treasure climb with live voice controls and speech teaching.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
