/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  // Allow loading dev resources (HMR / client bundle) when reaching the dev
  // server over the LAN IP from another device (e.g. testing on a phone).
  allowedDevOrigins: ["192.168.1.20"]
};

export default nextConfig;
