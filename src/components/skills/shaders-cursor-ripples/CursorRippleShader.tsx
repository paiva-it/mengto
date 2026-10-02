"use client";

import { Component, type ReactNode } from "react";
import { CursorRipples, ImageTexture, Shader } from "shaders/react";

type Props = {
  imageUrl: string;
  ready: boolean;
  onReady: () => void;
};

// A failed WebGPU start must leave the fallback photo in charge, not take the island down.
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function CursorRippleShader({ imageUrl, ready, onReady }: Props) {
  return (
    <Boundary>
      <Shader
        className={`cursor-ripple-shader${ready ? " is-ready" : ""}`}
        toneMapping="aces"
        disableTelemetry
        onReady={onReady}
        data-cursor-ripple-shader
        aria-hidden="true"
      >
        <ImageTexture url={imageUrl} objectFit="cover" />
        <CursorRipples decay={7.3} radius={0.6} />
      </Shader>
    </Boundary>
  );
}
