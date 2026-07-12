import json, struct, os
from PIL import Image
import io

SRC = r"F:/算法/游戏/SBGame/public/gugugaga.glb"
DST = r"F:/算法/游戏/SBGame/public/gugugaga.opt.glb"

with open(SRC, 'rb') as f:
    data = f.read()

magic, ver, length = struct.unpack('<III', data[:12])
assert magic == 0x46546C67, "not glTF"
off = 12
c0len, c0type = struct.unpack('<II', data[off:off+8]); off += 8
json_bytes = data[off:off+c0len]; off += c0len
c1len, c1type = struct.unpack('<II', data[off:off+8]); off += 8
bin_blob = data[off:off+c1len]

gltf = json.loads(json_bytes.decode('utf-8'))

# 解析每个贴图在材质里的角色
roles = {}
for m in gltf.get('materials', []):
    pbr = m.get('pbrMetallicRoughness', {})
    if 'baseColorTexture' in pbr:
        roles[pbr['baseColorTexture']['index']] = 'basecolor'
    if 'metallicRoughnessTexture' in pbr:
        roles[pbr['metallicRoughnessTexture']['index']] = 'mr'
    if 'normalTexture' in m:
        roles[m['normalTexture']['index']] = 'normal'
    if 'occlusionTexture' in m:
        roles[m['occlusionTexture']['index']] = 'occlusion'
    if 'emissiveTexture' in m:
        roles[m['emissiveTexture']['index']] = 'emissive'

# bufferView -> image index
img_bv = {}
for i, im in enumerate(gltf.get('images', [])):
    if 'bufferView' in im:
        img_bv[im['bufferView']] = i

orig_bv = gltf['bufferViews']
new_bv_bytes = []
for idx, bv in enumerate(orig_bv):
    start, size = bv['byteOffset'], bv['byteLength']
    chunk = bin_blob[start:start+size]
    if idx in img_bv:
        im_idx = img_bv[idx]
        im = gltf['images'][im_idx]
        img = Image.open(io.BytesIO(chunk))
        role = roles.get(im_idx, 'unknown')
        has_alpha = img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info)
        w, h = img.size
        target = 1024
        if max(w, h) > target:
            sc = target / max(w, h)
            img = img.resize((max(1, int(w*sc)), max(1, int(h*sc))), Image.LANCZOS)
        out = io.BytesIO()
        if role == 'normal':
            img = img.convert('RGB')
            img.save(out, 'PNG')          # 法线图无损，保留方向
            mime = 'image/png'
        elif role == 'basecolor' and has_alpha:
            img.save(out, 'PNG')          # 带透明则保留 PNG
            mime = 'image/png'
        else:
            img = img.convert('RGB')
            img.save(out, 'JPEG', quality=85)
            mime = 'image/jpeg'
        newchunk = out.getvalue()
        im['mimeType'] = mime
        if 'uri' in im:
            del im['uri']
        print(f"  img[{im_idx}] {role:9s} {w}x{h} -> {img.size} {mime:9s} {len(chunk)//1024}KB -> {len(newchunk)//1024}KB")
    else:
        newchunk = chunk
    new_bv_bytes.append(newchunk)

# 重建带 4 字节对齐的二进制
padded = []
pos = 0
for idx, chunk in enumerate(new_bv_bytes):
    if pos % 4:
        p = 4 - (pos % 4); padded.append(b'\x00'*p); pos += p
    orig_bv[idx]['byteOffset'] = pos
    orig_bv[idx]['byteLength'] = len(chunk)
    padded.append(chunk); pos += len(chunk)
if pos % 4:
    padded.append(b'\x00'*(4 - pos % 4)); pos += (4 - pos % 4)
new_bin = b''.join(padded)
gltf['buffers'][0]['byteLength'] = pos

new_json = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
if len(new_json) % 4:
    new_json += b' ' * (4 - len(new_json) % 4)

with open(DST, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 0))
    f.write(struct.pack('<II', len(new_json), 0x4E4F534A)); f.write(new_json)
    f.write(struct.pack('<II', len(new_bin), 0x004E4942)); f.write(new_bin)
    total = f.tell()
    f.seek(8); f.write(struct.pack('<I', total))

print(f"\nGLB: {os.path.getsize(SRC)//1024}KB -> {os.path.getsize(DST)//1024}KB")
