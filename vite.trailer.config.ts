import {defineConfig} from 'vite';
export default defineConfig({build:{outDir:'output/trailer/site',copyPublicDir:false,rollupOptions:{input:'trailer.html'}}});
