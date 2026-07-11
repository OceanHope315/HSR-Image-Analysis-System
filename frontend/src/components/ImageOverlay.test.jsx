import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ImageOverlay from './ImageOverlay.jsx';

describe('检测框叠加', () => {
  it('将超出图片右下边界的框限制在画面内', () => {
    const { container } = render(
      <ImageOverlay
        src="data:image/png;base64,AA=="
        detections={[{ className: 'lighter', confidence: 0.9, bbox: { x: 0.9, y: 0.85, width: 0.5, height: 0.4 } }]}
      />,
    );
    const box = container.querySelector('.detection-box');
    expect(box).toHaveStyle({ left: '90%', top: '85%', width: '10%', height: '15%' });
    expect(screen.getByText(/lighter/)).toBeInTheDocument();
  });

  it('没有图片时显示清晰占位状态', () => {
    render(<ImageOverlay src="" detections={[]} />);
    expect(screen.getByRole('img', { name: '暂无 X 光图片' })).toBeInTheDocument();
  });
});
