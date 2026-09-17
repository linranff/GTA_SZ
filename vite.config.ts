import {defineConfig} from 'vite';
export default defineConfig({
  server: {
    host:'127.0.0.1',hmr:false,
    fs:{deny:['**/.env','**/.env.*','**/*.{crt,pem}','**/.git/**','**/local-only/**','**/data/raw/local-mmd/**']},
    // Large binaries and editor atomic-save temp dirs never take part in HMR; watching them
    // raised EBUSY inside FSWatcher and killed the whole dev server (GTA_SZ#4). Side effect: Vite
    // indexes public/ once at start-up, so a *new* .glb/.hdr written while the server runs is
    // served as index.html until `npm run dev` restarts (edits to existing files are unaffected).
    watch:{usePolling:false,ignored:['**/local-only/**','**/artifacts/**','**/data/**','**/output/**','**/.venv/**','**/*.blend','**/*.blend1','**/*.tmpdir','**/*.tmpdir/**','**/*.glb','**/*.bin','**/*.hdr','**/*.ktx2','**/*.basis']},
  },
});
