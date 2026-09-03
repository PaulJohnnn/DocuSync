import { NextResponse } from 'next/server';
import os from 'os';

export async function GET() {
  let localIp = '127.0.0.1';
  
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      // Skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break; // Only take the first one
      }
    }
  }

  return NextResponse.json({ ip: localIp });
}
