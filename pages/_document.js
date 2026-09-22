import { Html, Head, Main, NextScript } from 'next/document';
export default function Document() {
  return (
    <Html lang="pt-BR">
      <Head>
        <script src="https://telegram.org/js/telegram-web-app.js" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lilita+One&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#0D1222" />
        <link rel="icon" href="/favicon.svg" />
      </Head>
      <body><Main /><NextScript /></body>
    </Html>
  );
}
