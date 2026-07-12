import fs from 'fs';
function inspect(path){
  const buf = fs.readFileSync(path);
  const magic = buf.toString('ascii',0,4);
  const ver = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);
  const c0len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8',20,20+c0len));
  const meshes = json.meshes ? json.meshes.length : 0;
  let prims = 0;
  if (json.meshes) json.meshes.forEach(m => { prims += (m.primitives ? m.primitives.length : 0); });
  const mats = json.materials ? json.materials.length : 0;
  const tex = json.textures ? json.textures.length : 0;
  const nodes = json.nodes ? json.nodes.length : 0;
  const hasBin = buf.length > 20 + c0len + 8;
  console.log('\n== ' + path);
  console.log('  magic=' + magic + ' ver=' + ver + ' totalBytes=' + length + ' (file=' + buf.length + ')');
  console.log('  meshes=' + meshes + ' primitives=' + prims + ' materials=' + mats + ' textures=' + tex + ' nodes=' + nodes + ' binaryChunk=' + hasBin);
  if (json.materials){
    json.materials.slice(0,6).forEach((m,i)=>{
      const c = m.pbrMetallicRoughness ? m.pbrMetallicRoughness.baseColorFactor : null;
      const col = c ? c.map(x=>x.toFixed(2)).join(',') : '-';
      const t = m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture ? 'Y' : 'N';
      console.log('   mat[' + i + '] name=' + (m.name||'-') + ' color=' + col + ' hasTex=' + t);
    });
  }
}
inspect('public/gugugaga.glb');
inspect('public/gugugaga_1.glb');
