import Head from 'next/head';
import '../styles/globals.css';
import '../styles/admin.css';
export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <title>BoraBet · Dominó em dupla</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
