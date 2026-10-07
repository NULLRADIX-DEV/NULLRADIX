import { defineConfig } from 'vite';

// Multi-page vanilla build. base:'/' works for Netlify/Vercel/custom domains.
// For a GitHub Pages *project* site (user.github.io/NULLRADIX) set base:'/NULLRADIX/'.
export default defineConfig({
  base: '/',
  build: {
    target: 'es2020',
    cssMinify: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      // root HTML entries (paths relative to project root)
      input: {
        main: 'index.html',
        impressum: 'impressum.html',
        datenschutz: 'datenschutz.html',
        notfound: '404.html',
      },
    },
  },
});
