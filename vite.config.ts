import {defineConfig} from 'vite';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';

// Restricted character derivatives are served ONLY by loopback development.
// They are outside public/, never imported, and never copied into dist/.
const localCharacters=resolve('local-only/characters');
export default defineConfig({
  plugins:[{name:'local-character-validation',apply:'serve',configureServer(server){
    server.middlewares.use('/__local-characters',(req,res)=>{
      const remote=req.socket.remoteAddress;
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote??'')){res.statusCode=403;res.end();return;}
      const name=(req.url??'').split('?')[0].replace(/^\//,'');
      if(!['manifest.json','kuki.glb','yelan.glb'].includes(name)){res.statusCode=404;res.end();return;}
      const file=resolve(localCharacters,name);
      if(!existsSync(file)){res.statusCode=404;res.end('Local character not prepared');return;}
      res.setHeader('Content-Type',name.endsWith('.json')?'application/json; charset=utf-8':'model/gltf-binary');
      res.setHeader('Cache-Control','no-store');res.setHeader('Content-Length',statSync(file).size);
      const stream=createReadStream(file);stream.on('error',()=>{res.destroy();});stream.pipe(res);
    });
  }}],
  server: {
    host:'127.0.0.1',hmr:false,
    fs:{deny:['**/.env','**/.env.*','**/*.{crt,pem}','**/.git/**','**/local-only/**','**/data/raw/local-mmd/**']},
    watch:{usePolling:false,ignored:['**/local-only/**','**/artifacts/**','**/data/**','**/output/**','**/.venv/**','**/*.blend','**/*.blend1']},
  },
});
