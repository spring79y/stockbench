import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Next.js 16은 개발 모드에서 cross-origin으로 /_next/* 를 막습니다.
   * ngrok·LAN IP로 접속하면 하이드레이션 JS가 403 → 클릭이 전부 무반응처럼 보입니다.
   */
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    // LAN
    "192.168.*.*",
    "10.*.*.*",
    "172.16.*.*",
    "172.17.*.*",
    "172.18.*.*",
    "172.19.*.*",
    "172.20.*.*",
    "172.21.*.*",
    "172.22.*.*",
    "172.23.*.*",
    "172.24.*.*",
    "172.25.*.*",
    "172.26.*.*",
    "172.27.*.*",
    "172.28.*.*",
    "172.29.*.*",
    "172.30.*.*",
    "172.31.*.*",
    // ngrok (서브도메인이 매번 바뀜)
    "*.ngrok-free.dev",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.ngrok.app",
  ],
};

export default nextConfig;
