import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const SOURCE_COMMIT = '6f12ffb2f924af86d910ade13e6e2ba3df8cd3df';
const SOURCE_ROOT = `https://raw.githubusercontent.com/dustinc555/mygame/${SOURCE_COMMIT}/assets/vendor/quaternius/universal_base_characters/base_characters`;
const TARGET = path.resolve('public/assets/vendor/quaternius/universal-base-characters');

const MODELS = [
  ['Teen_Male_FullBody', 'c3630c8d356a95690fd2acebb897a67238c45b7e', 'e15a70692a0bad2e3a063e4605df80544e8526f9'],
  ['Teen_Female_FullBody', '1875fc5ee0778dbbbaf25a13c4ade14e18a52248', '5f20e9f014981fd25a3fd57489090f3e1d3744fd'],
  ['Regular_Male_FullBody', '5526994d439be4af9b99d283e89003bf0aeb0684', 'a29b55fa45af6f1d53a25c51b01d918f99f42338'],
  ['Regular_Female_FullBody', 'd3b49ff45935a033f9b675b3263caafcda1c9aa0', '9b7aa482bb10cb1af83ff99c121f1687734d98f0'],
  ['Superhero_Male_FullBody', '7e4b5b57dca66cced9127b25a6f111a0919da00a', '54309de6c6ccad823a8ced11056f4013b197b1c6'],
  ['Superhero_Female_FullBody', '804aa3d3bbbd1977d31ec25c7dbf9a00705be49d', '6e6507c85a4993e97d31f187b4d0715af300400d'],
];

const SAME = (sha, names) => Object.fromEntries(names.map((name) => [name, sha]));
const TEXTURES = {
  ...SAME('0d037febc2789c86fdb40d7ccd4c0a1d0591cfbe', ['T_Eye_Brown.png']),
  ...SAME('2da59128bac4b6d4a87fc0ee1d1835cd52e21028', ['T_Eye_Normal.png', 'T_Eye_Normal_png.png']),
  ...SAME('c398ca7d10a12d0a1c3fb19d459280bde868594b', ['T_Hair_1_BaseColor.png', 'T_Hair_1_BaseColor_png.png']),
  ...SAME('5aa652eded3befcd3cab03950309c715de42c297', ['T_Hair_1_Normal.png', 'T_Hair_1_Normal_png.png']),
  ...SAME('bda8d959b61fc57184bfc287ce2e62143c6faff6', ['T_Hair_2_BaseColor.png', 'T_Hair_2_BaseColor_png.png']),
  ...SAME('2d77b1dd52d5e2954b953364e2cf3555305971ed', ['T_Hair_2_Normal.png', 'T_Hair_2_Normal_png.png']),
  ...SAME('4b97582044f8334de647ba06fbe56e215be79632', ['T_Regular_Female_Dark_BaseColor_png.png']),
  ...SAME('f452ce11ec312f445a52f32f001b1fd8426b417a', ['T_Regular_Female_Normal_png.png']),
  ...SAME('8dae8d59821a5ebf8d88149f93121d66118a3322', ['T_Regular_Female_Roughness_png.png']),
  ...SAME('4520f4cc2bef13ff3cde709aa07d4aa6e18a7877', ['T_Regular_Male_Dark_BaseColor_png.png']),
  ...SAME('705c2f2f20b25192783b37c054a5d21354906dfe', ['T_Regular_Male_Normal_png.png']),
  ...SAME('3979c3ed368cd8e3834aaa4eadce8e3948253781', ['T_Regular_Male_Roughness_png.png']),
  ...SAME('3d7459a7130ce526396199b652fb470a1415dc0b', ['T_Teen_Female_Dark_BaseColor_png.png']),
  ...SAME('8e2827977547f639e0a41e5da1fe53b4acf0ccd1', ['T_Teen_Female_Normal.png']),
  ...SAME('a38a83b6663f2012cf8f342ec2f84252ee190039', ['T_Teen_Female_Roughness_png.png']),
  ...SAME('bc6a8de58cb9c349e10a217905cbde55a9f91164', ['T_Teen_Male_Dark_BaseColor.png']),
  ...SAME('b808ce7f954803136df53cf3282bae781da21635', ['T_Teen_Male_Normal.png']),
  ...SAME('c83b782be8ff822181a602fec847d680f329ef51', ['T_Teen_Male_Roughness.png']),
  ...SAME('06d49a50a69873d30f687f59e74e94d34e69ad9a', ['T_Superhero_Female_Dark_BaseColor.png']),
  ...SAME('21d0bd6f24f031f10b1a8278a1d414ac0b371ad9', ['T_Superhero_Female_Light_BaseColor.png']),
  ...SAME('20af328bc43a49a54b2b0fab62e5267b9a5993fa', ['T_Superhero_Female_Normal.png']),
  ...SAME('d496b5331598258460a00aaedda2b9bc96ab9c8f', ['T_Superhero_Female_Roughness.png']),
  ...SAME('6391f45275f6c904edbde5daa500bab26b103366', ['T_Superhero_Male_Dark.png']),
  ...SAME('71b53f579330ffd84c5b774f3e02aa969659df40', ['T_Superhero_Male_Ligh.png']),
  ...SAME('88303e2ad3f435853cd10d509adbbae960af4279', ['T_Superhero_Male_Normal.png']),
  ...SAME('2bbc618d20047d14fd51faf5be5bc272f5a8bf6d', ['T_Superhero_Male_Roughness.png']),
};

function gitBlobSha1(bytes) {
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function existingValid(name, expected) {
  try {
    const bytes = await fs.readFile(path.join(TARGET, name));
    return gitBlobSha1(bytes) === expected;
  } catch { return false; }
}

async function download(name, expected) {
  if (!expected) throw new Error(`角色资源 ${name} 缺少锁定 Git Blob SHA-1，拒绝未锁定下载。`);
  if (await existingValid(name, expected)) return await fs.readFile(path.join(TARGET, name));
  const response = await fetch(`${SOURCE_ROOT}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`下载角色资源失败 ${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = gitBlobSha1(bytes);
  if (actual !== expected) throw new Error(`角色资源完整性失败 ${name}: expected ${expected}, got ${actual}`);
  await fs.writeFile(path.join(TARGET, name), bytes);
  return bytes;
}

await fs.mkdir(TARGET, { recursive: true });
const records = {};
const referencedTextures = new Set();
for (const [base, gltfSha, binSha] of MODELS) {
  const gltfName = `${base}.gltf`;
  const gltfBytes = await download(gltfName, gltfSha);
  const binName = `${base}.bin`;
  const binBytes = await download(binName, binSha);
  const gltf = JSON.parse(gltfBytes.toString('utf8'));
  for (const image of gltf.images ?? []) if (image.uri) referencedTextures.add(image.uri);
  records[gltfName] = { gitBlobSha1: gltfSha, sha256: sha256(gltfBytes), bytes: gltfBytes.length };
  records[binName] = { gitBlobSha1: binSha, sha256: sha256(binBytes), bytes: binBytes.length };
}
for (const name of [...referencedTextures].sort()) {
  const bytes = await download(name, TEXTURES[name]);
  records[name] = { gitBlobSha1: TEXTURES[name], sha256: sha256(bytes), bytes: bytes.length };
}

const manifest = {
  schema: 'pds-character-assets-1',
  assetPack: 'Quaternius Universal Base Characters',
  author: 'Quaternius',
  license: 'CC0-1.0',
  officialSource: 'https://quaternius.com/packs/universalbasecharacters.html',
  mirror: 'https://github.com/dustinc555/mygame',
  mirrorCommit: SOURCE_COMMIT,
  installedAt: new Date().toISOString(),
  files: records,
};
await fs.writeFile(path.join(TARGET, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`PDS 正式角色资源已就绪：${MODELS.length} 个 Humanoid 模型，${referencedTextures.size} 个引用贴图，全部通过 Git Blob 完整性校验。`);
