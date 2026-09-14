import { Page, Request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export class BandwidthProfiler {
  private totalBytesSent = 0;
  private totalBytesReceived = 0;
  private algorithm: 'lww' | 'ot';
  private logPath: string;

  constructor(algorithm: 'lww' | 'ot' = 'lww') {
    this.algorithm = algorithm;
    this.logPath = path.join(__dirname, '..', '..', '..', 'metrics', `${algorithm}-bandwidth.json`);
    if (!fs.existsSync(path.dirname(this.logPath))) {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
    }
  }

  public attach(page: Page) {
    page.on('request', (request: Request) => {
      if (request.url().includes('/api/lobby')) {
        const postData = request.postDataBuffer();
        if (postData) {
          this.totalBytesSent += postData.length;
        }
      }
    });

    page.on('response', async (response) => {
      if (response.url().includes('/api/lobby')) {
        try {
          const body = await response.body();
          this.totalBytesReceived += body.length;
        } catch (e) {
          // Response may have closed early
        }
      }
    });

    // We can also attach to WebSocket frames if they establish ws:// connections
    page.on('websocket', (ws) => {
      ws.on('framesent', (payload) => {
        const size = Buffer.isBuffer(payload) ? payload.length : Buffer.from(String(payload)).length;
        this.totalBytesSent += size;
      });
      ws.on('framereceived', (payload) => {
        const size = Buffer.isBuffer(payload) ? payload.length : Buffer.from(String(payload)).length;
        this.totalBytesReceived += size;
      });
    });
  }

  public getMetrics() {
    return {
      algorithm: this.algorithm,
      totalBytesSent: this.totalBytesSent,
      totalBytesReceived: this.totalBytesReceived,
    };
  }

  public saveMetrics() {
    fs.writeFileSync(this.logPath, JSON.stringify(this.getMetrics(), null, 2));
    console.log(`[BandwidthProfiler] Saved ${this.algorithm} metrics to ${this.logPath}`);
  }
}
