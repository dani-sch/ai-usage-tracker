import fs from 'node:fs';
import zlib from 'node:zlib';
fs.mkdirSync('build',{recursive:true}); fs.mkdirSync('src/assets',{recursive:true});
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data){const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);let crc=0xffffffff;for(const b of Buffer.concat([name,data]))crc=crcTable[(crc^b)&255]^(crc>>>8);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;}
function inside(x,y,points){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))yes=!yes;}return yes;}
function png(n,template=false){const raw=Buffer.alloc((n*4+1)*n); const points=[[.28,.64],[.55,.37],[.34,.37],[.34,.26],[.75,.26],[.75,.67],[.64,.67],[.64,.46],[.37,.73]];
for(let y=0;y<n;y++)for(let x=0;x<n;x++){const X=x/n,Y=y/n,off=y*(n*4+1)+1+x*4;const r=.22,dx=Math.max(r-X,0,X-(1-r)),dy=Math.max(r-Y,0,Y-(1-r));const bg=dx*dx+dy*dy<=r*r;const arrow=inside(X,Y,points);const color=arrow?[22,35,15,255]:template?[0,0,0,0]:bg?[202-Math.round(Y*16),245-Math.round(Y*14),134-Math.round(Y*14),255]:[0,0,0,0];if(template&&arrow)color.splice(0,3,0,0,0);for(let c=0;c<4;c++)raw[off+c]=color[c];}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(n);ihdr.writeUInt32BE(n,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const p256=png(256),p512=png(512),p1024=png(1024);fs.writeFileSync('src/assets/icon.png',p512);fs.writeFileSync('src/assets/trayTemplate.png',png(32,true));
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(p256.length,14);ico.writeUInt32LE(22,18);fs.writeFileSync('build/icon.ico',Buffer.concat([ico,p256]));
const entries=[['ic08',p256],['ic09',p512],['ic10',p1024]].map(([type,p])=>{const head=Buffer.alloc(8);head.write(type);head.writeUInt32BE(p.length+8,4);return Buffer.concat([head,p]);});const head=Buffer.alloc(8);head.write('icns');head.writeUInt32BE(8+entries.reduce((n,b)=>n+b.length,0),4);fs.writeFileSync('build/icon.icns',Buffer.concat([head,...entries]));
