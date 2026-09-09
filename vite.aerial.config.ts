import {defineConfig} from 'vite';
export default defineConfig({build:{outDir:'output/aerial-film/site',copyPublicDir:false,rollupOptions:{input:'trailer.html'}}});
