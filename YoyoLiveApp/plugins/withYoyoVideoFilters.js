const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const nativeSource = `package com.yoyolive.app;

import io.livekit.reactnative.webrtc.videoEffects.ProcessorProvider;
import io.livekit.reactnative.webrtc.videoEffects.VideoFrameProcessor;
import io.livekit.reactnative.webrtc.videoEffects.VideoFrameProcessorFactoryInterface;
import livekit.org.webrtc.JavaI420Buffer;
import livekit.org.webrtc.SurfaceTextureHelper;
import livekit.org.webrtc.VideoFrame;
import java.nio.ByteBuffer;

public final class YoyoLiveVideoFilters {
  private YoyoLiveVideoFilters() {}

  public static void register() {
    register("yoyo_warm", "warm");
    register("yoyo_cool", "cool");
    register("yoyo_mono", "mono");
    register("yoyo_vintage", "vintage");
    register("yoyo_vivid", "vivid");
    register("yoyo_bright", "bright");
  }

  private static void register(String name, String mode) {
    ProcessorProvider.addProcessor(name, new VideoFrameProcessorFactoryInterface() {
      @Override public VideoFrameProcessor build() { return new ColorFilterProcessor(mode); }
    });
  }

  private static final class ColorFilterProcessor implements VideoFrameProcessor {
    private final String mode;
    ColorFilterProcessor(String mode) { this.mode = mode; }

    @Override
    public VideoFrame process(VideoFrame frame, SurfaceTextureHelper textureHelper) {
      VideoFrame.I420Buffer input = frame.getBuffer().toI420();
      int width = input.getWidth();
      int height = input.getHeight();
      JavaI420Buffer output = JavaI420Buffer.allocate(width, height);
      try {
        transformLuma(input.getDataY(), input.getStrideY(), output.getDataY(), output.getStrideY(), width, height);
        int chromaWidth = (width + 1) / 2;
        int chromaHeight = (height + 1) / 2;
        transformChroma(input.getDataU(), input.getStrideU(), output.getDataU(), output.getStrideU(), chromaWidth, chromaHeight, true);
        transformChroma(input.getDataV(), input.getStrideV(), output.getDataV(), output.getStrideV(), chromaWidth, chromaHeight, false);
        return new VideoFrame(output, frame.getRotation(), frame.getTimestampNs());
      } catch (RuntimeException | Error error) {
        output.release();
        throw error;
      } finally {
        input.release();
      }
    }

    private void transformLuma(ByteBuffer source, int sourceStride, ByteBuffer target, int targetStride, int width, int height) {
      float contrast = 1.0f;
      int brightness = 0;
      if ("vintage".equals(mode)) { contrast = 0.88f; brightness = 12; }
      if ("vivid".equals(mode)) { contrast = 1.12f; brightness = 2; }
      if ("bright".equals(mode)) { brightness = 18; }
      if ("warm".equals(mode)) { brightness = 3; }
      for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
          int value = source.get(y * sourceStride + x) & 0xff;
          int adjusted = Math.round((value - 128) * contrast + 128) + brightness;
          target.put(y * targetStride + x, (byte) clamp(adjusted));
        }
      }
    }

    private void transformChroma(ByteBuffer source, int sourceStride, ByteBuffer target, int targetStride, int width, int height, boolean isU) {
      float saturation = "vivid".equals(mode) ? 1.22f : "vintage".equals(mode) ? 0.72f : 1.0f;
      int shift = 0;
      if ("warm".equals(mode)) shift = isU ? -5 : 9;
      if ("cool".equals(mode)) shift = isU ? 8 : -7;
      if ("vintage".equals(mode)) shift = isU ? -2 : 4;
      if ("mono".equals(mode)) saturation = 0.0f;
      for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
          int value = source.get(y * sourceStride + x) & 0xff;
          int adjusted = Math.round((value - 128) * saturation + 128) + shift;
          target.put(y * targetStride + x, (byte) clamp(adjusted));
        }
      }
    }

    private static int clamp(int value) { return Math.max(0, Math.min(255, value)); }
  }
}
`;

function withYoyoVideoFilters(config) {
  config = withDangerousMod(config, ['android', async (modConfig) => {
    const javaPath = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main/java/com/yoyolive/app/YoyoLiveVideoFilters.java');
    await fs.promises.mkdir(path.dirname(javaPath), { recursive: true });
    await fs.promises.writeFile(javaPath, nativeSource, 'utf8');
    return modConfig;
  }]);

  config = withMainApplication(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    if (!contents.includes('YoyoLiveVideoFilters.register()')) {
      if (!contents.includes('super.onCreate()')) throw new Error('YOYO LIVE filters: could not find MainApplication onCreate()');
      contents = contents.replace('super.onCreate()', 'super.onCreate()\n    YoyoLiveVideoFilters.register()');
    }
    modConfig.modResults.contents = contents;
    return modConfig;
  });
  return config;
}

module.exports = withYoyoVideoFilters;
