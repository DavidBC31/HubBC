import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixe la racine du workspace sur ce projet. Sans ça, un package-lock.json
  // traînant dans ~ fait inférer /Users/david comme racine -> Turbopack surveille
  // tout le home et le dev-server crashe ("Map maximum size exceeded").
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
