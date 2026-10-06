import { build } from 'esbuild';
await build({entryPoints:['src/index.tsx'],outdir:'extension/dist',bundle:true,splitting:true,format:'esm',target:'es2022',minify:true,sourcemap:true,legalComments:'eof'});
