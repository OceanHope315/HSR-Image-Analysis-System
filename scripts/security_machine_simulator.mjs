import fs from 'node:fs/promises';
import path from 'node:path';

function usage() {
  return [
    '用法：npm run simulator -- <main.jpg> [side.jpg] [--url=http://127.0.0.1:5000/imageAnalysis/imgInfo]',
    '可选：--device=TEST_000001 --data-uri',
  ].join('\n');
}

function timestamp(date = new Date()) {
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}`;
}

function imageInfo(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg'].includes(extension)) return { protocolType: 'JPG', mime: 'image/jpeg', extension: '.jpg' };
  if (extension === '.png') return { protocolType: 'PNG', mime: 'image/png', extension: '.png' };
  throw new Error(`模拟器仅支持 JPG/JPEG/PNG：${filePath}`);
}

function option(args, prefix, fallback) {
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith('--'));
if (!positional.length || args.includes('--help')) {
  process.stdout.write(`${usage()}\n`);
  process.exit(positional.length ? 0 : 1);
}

const [mainPath, sidePath] = positional.map((value) => path.resolve(value));
const mainInfo = imageInfo(mainPath);
const sideInfo = sidePath ? imageInfo(sidePath) : null;
if (sideInfo && sideInfo.protocolType !== mainInfo.protocolType) {
  throw new Error('当前文档只有一个 imgType；主/侧视角请使用相同图片格式');
}

const [mainBuffer, sideBuffer] = await Promise.all([
  fs.readFile(mainPath),
  sidePath ? fs.readFile(sidePath) : null,
]);
const imageId = timestamp();
const useDataUri = args.includes('--data-uri');
const encode = (buffer, info) => {
  const base64 = buffer.toString('base64');
  return useDataUri ? `data:${info.mime};base64,${base64}` : base64;
};
const payload = {
  devID: option(args, '--device=', 'TEST_000001'),
  imgID: imageId,
  imgType: mainInfo.protocolType,
  img: {
    imgName0: `${imageId.slice(9)}_0${mainInfo.extension}`,
    img0: encode(mainBuffer, mainInfo),
    ...(sideBuffer ? {
      imgName1: `${imageId.slice(9)}_1${sideInfo.extension}`,
      img1: encode(sideBuffer, sideInfo),
    } : {}),
    imgTime: imageId,
  },
};
const url = option(args, '--url=', process.env.SECURITY_MACHINE_URL || 'http://127.0.0.1:5000/imageAnalysis/imgInfo');
const response = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});
const responseText = await response.text();
let responseBody = responseText;
try {
  responseBody = JSON.parse(responseText);
} catch {
  // Preserve non-JSON device/server responses for protocol troubleshooting.
}

process.stdout.write(`${JSON.stringify({
  request: {
    method: 'POST',
    url,
    devID: payload.devID,
    imgID: payload.imgID,
    imgType: payload.imgType,
    views: sideBuffer ? 2 : 1,
    decodedBytes: { img0: mainBuffer.length, ...(sideBuffer ? { img1: sideBuffer.length } : {}) },
    base64Mode: useDataUri ? 'data-uri' : 'raw',
  },
  response: {
    status: response.status,
    body: responseBody,
  },
}, null, 2)}\n`);
if (!response.ok) process.exitCode = 1;
