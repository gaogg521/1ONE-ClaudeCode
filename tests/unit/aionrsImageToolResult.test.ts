import { describe, expect, it } from 'vitest';
import { mapAionrsToolResultDisplay } from '@/process/agent/aionrs';

describe('mapAionrsToolResultDisplay', () => {
  it('extracts relative image paths from image tool text output', () => {
    const result = mapAionrsToolResultDisplay({
      type: 'tool_result',
      msg_id: 'msg-1',
      call_id: 'call-1',
      tool_name: 'ImageGeneration',
      status: 'success',
      output: '我已经为您生成了一张草地上小鸟的图片!\n\n图片已保存到: img-1776250473137.jpg',
      output_type: 'image',
    });

    expect(result).toEqual({
      img_url: 'img-1776250473137.jpg',
      relative_path: 'img-1776250473137.jpg',
    });
  });

  it('prefers metadata image path when available', () => {
    const result = mapAionrsToolResultDisplay({
      type: 'tool_result',
      msg_id: 'msg-2',
      call_id: 'call-2',
      tool_name: 'ImageGeneration',
      status: 'success',
      output: 'image saved',
      output_type: 'image',
      metadata: {
        file_path: 'C:/tmp/generated.png',
        relative_path: 'generated.png',
      },
    });

    expect(result).toEqual({
      img_url: 'C:/tmp/generated.png',
      relative_path: 'generated.png',
    });
  });
});
