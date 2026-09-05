import {defineConfig} from 'vite';

export default defineConfig({
  server: {
    // Large Blender sources and Python environments are not browser inputs.
    // Keep play sessions stable while source and assets are being edited.
    hmr: false,
    watch: {usePolling: false, ignored: ['**/artifacts/**', '**/data/**', '**/output/**', '**/.venv/**', '**/*.blend', '**/*.blend1']},
  },
});
