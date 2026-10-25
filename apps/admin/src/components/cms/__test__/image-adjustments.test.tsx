import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ImageAdjustments } from '../image-adjustments';
import type { ImageEdits, AppliedImageEdits } from '../image-adjustments';

afterEach(cleanup);

const labels = {
  preview: 'Image adjustment preview',
  cropX: 'Crop X',
  cropY: 'Crop Y',
  cropWidth: 'Crop width',
  cropHeight: 'Crop height',
  focalX: 'Focal X',
  focalY: 'Focal Y',
  apply: 'Apply adjustments',
  error: 'Invalid image dimensions',
};

const initial: ImageEdits = {
  crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  focalPoint: { x: 0.5, y: 0.5 },
};

it('applies normalized crop values as independently calculated pixel dimensions', () => {
  const onApply = vi.fn<(edits: AppliedImageEdits) => void>();
  render(
    <ImageAdjustments
      image={{ src: '/image.png', alt: 'Landscape', width: 800, height: 600 }}
      value={initial}
      onChange={vi.fn<(edits: ImageEdits) => void>()}
      onApply={onApply}
      labels={labels}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Apply adjustments' }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith({
    crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    focalPoint: { x: 0.5, y: 0.5 },
    pixelWidth: 400,
    pixelHeight: 300,
  });
});

it('clamps crop and focal changes to the image bounds while remaining keyboard editable', () => {
  const onApply = vi.fn<(edits: AppliedImageEdits) => void>();
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <ImageAdjustments
        image={{ src: '/image.png', alt: 'Landscape', width: 800, height: 600 }}
        value={value}
        onChange={setValue}
        onApply={onApply}
        labels={labels}
      />
    );
  }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Crop width'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Focal X'), { target: { value: '-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply adjustments' }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith({
    crop: { x: 0.25, y: 0.25, width: 0.75, height: 0.5 },
    focalPoint: { x: 0, y: 0.5 },
    pixelWidth: 600,
    pixelHeight: 300,
  });
});

it('rejects invalid dimensions instead of emitting NaN or zero-size output', () => {
  const onApply = vi.fn<(edits: AppliedImageEdits) => void>();
  render(
    <ImageAdjustments
      image={{ src: '/image.png', alt: 'Landscape', width: 0, height: 600 }}
      value={initial}
      onChange={vi.fn<(edits: ImageEdits) => void>()}
      onApply={onApply}
      labels={labels}
    />,
  );
  expect(screen.getByRole('alert').textContent).toContain('Invalid image dimensions');
  expect(screen.getByRole('button', { name: 'Apply adjustments' })).toHaveProperty(
    'disabled',
    true,
  );
  expect(onApply).not.toHaveBeenCalled();
});

it('keeps pointer and keyboard focal edits bounded and uses at least one output pixel', () => {
  const onApply = vi.fn<(edits: AppliedImageEdits) => void>();
  function Harness({ readOnly }: { readOnly: boolean }) {
    const [value, setValue] = useState(initial);
    return (
      <ImageAdjustments
        image={{ src: '/image.png', alt: 'Landscape', width: 800, height: 600 }}
        value={value}
        onChange={setValue}
        onApply={onApply}
        labels={labels}
        readOnly={readOnly}
      />
    );
  }
  const { rerender } = render(<Harness readOnly={false} />);
  const preview = screen.getByRole('group', { name: 'Image adjustment preview' });
  vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100));
  fireEvent.pointerDown(preview, { clientX: 150, clientY: 25 });
  fireEvent.keyDown(preview, { key: 'ArrowLeft' });
  fireEvent.keyDown(preview, { key: 'ArrowRight' });
  fireEvent.keyDown(preview, { key: 'ArrowUp' });
  fireEvent.keyDown(preview, { key: 'ArrowDown' });
  fireEvent.keyDown(preview, { key: 'Escape' });
  fireEvent.change(screen.getByLabelText('Crop X'), { target: { value: '0.99' } });
  fireEvent.change(screen.getByLabelText('Crop Y'), { target: { value: '0.99' } });
  fireEvent.change(screen.getByLabelText('Crop width'), { target: { value: '-1' } });
  fireEvent.change(screen.getByLabelText('Crop height'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Focal Y'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Focal X'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply adjustments' }));
  expect(onApply).toHaveBeenLastCalledWith({
    crop: { x: 0.5, y: 0.5, width: 1 / 800, height: 0.5 },
    focalPoint: { x: 0.75, y: 1 },
    pixelWidth: 1,
    pixelHeight: 300,
  });
  rerender(<Harness readOnly />);
  fireEvent.pointerDown(preview, { clientX: 0, clientY: 0 });
  fireEvent.keyDown(preview, { key: 'ArrowLeft' });
  fireEvent.change(screen.getByLabelText('Crop X'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Focal X'), { target: { value: '0' } });
  expect(screen.getByLabelText('Focal X')).toHaveProperty('value', '0.75');
  expect(screen.getByRole('button', { name: 'Apply adjustments' })).toHaveProperty(
    'disabled',
    true,
  );
});

it('does not infer pointer coordinates from an empty preview or permit an unsafe image source', () => {
  const onChange = vi.fn<(edits: ImageEdits) => void>();
  const props = {
    image: { src: '/image.png', alt: 'Landscape', width: 800, height: 600 },
    value: initial,
    onChange,
    onApply: vi.fn<(edits: AppliedImageEdits) => void>(),
    labels,
  };
  const { rerender } = render(<ImageAdjustments {...props} />);
  fireEvent.pointerDown(screen.getByRole('group', { name: 'Image adjustment preview' }), {
    clientX: 1,
    clientY: 1,
  });
  expect(onChange).not.toHaveBeenCalled();
  rerender(<ImageAdjustments {...props} image={{ ...props.image, src: 'javascript:alert(1)' }} />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByRole('alert').textContent).toBe('Invalid image dimensions');
  expect(screen.getByRole('button', { name: 'Apply adjustments' })).toHaveProperty(
    'disabled',
    true,
  );
});
