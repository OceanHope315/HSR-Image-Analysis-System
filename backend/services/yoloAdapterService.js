const safeItems = ['umbrella', 'laptop', 'book', 'clothes', 'backpack'];
const riskyItems = ['knife', 'lighter', 'aerosol', 'flammable_liquid'];

function bbox(random) {
  return {
    x: Math.round(random() * 500),
    y: Math.round(random() * 300),
    width: Math.round(40 + random() * 160),
    height: Math.round(40 + random() * 160),
  };
}

export function createMockYoloResult({ risk = 'low', random = Math.random } = {}) {
  const count = risk === 'high' ? 2 : 1;
  return Array.from({ length: count }, (_, index) => {
    const source = risk === 'low' ? safeItems : riskyItems;
    return {
      className: source[Math.floor(random() * source.length)],
      confidence: Number((risk === 'low' ? 0.55 + random() * 0.35 : 0.78 + random() * 0.2).toFixed(3)),
      bbox: bbox(random),
      modelName: 'mock-yolo',
      modelVersion: 'simulation-v1',
      ...(index === 0 ? {} : { className: 'lighter' }),
    };
  });
}

export async function analyzeXray(_imageReference, options = {}) {
  return createMockYoloResult(options);
}
