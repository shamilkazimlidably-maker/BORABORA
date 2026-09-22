/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  poweredByHeader: false,
  optimizeFonts: false,
  async headers() {
    return [{
      source: '/admin',
      headers: [{ key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Robots-Tag', value: 'noindex' }],
    }];
  },
};
