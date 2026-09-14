import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export class LatencyProfiler {
  private startTime: number = 0;
  private endTime: number = 0;
  private algorithm: 'lww' | 'ot';
  private logPath: string;
  private latencies: number[] = [];

  constructor(algorithm: 'lww' | 'ot' = 'lww') {
    this.algorithm = algorithm;
    this.logPath = path.join(__dirname, '..', '..', '..', 'metrics', `${algorithm}-latency.json`);
    if (!fs.existsSync(path.dirname(this.logPath))) {
      fs.mkdirSync(path.dirname(this.logPath), { recursive: true });
    }
  }

  public startTimer() {
    this.startTime = Date.now();
  }

  public stopTimer() {
    this.endTime = Date.now();
    const duration = this.endTime - this.startTime;
    this.latencies.push(duration);
    return duration;
  }

  public async awaitDOMConvergence(page: Page, expectedContent: string, timeout = 5000) {
    this.startTimer();
    try {
      await page.waitForFunction(
        (expected) => document.body.innerText.includes(expected),
        expectedContent,
        { timeout }
      );
      return this.stopTimer();
    } catch (e) {
      console.error(`[LatencyProfiler] Convergence timed out for "${expectedContent}"`);
      return -1; // -1 indicates failure to converge/data loss
    }
  }

  public getMetrics() {
    const validLatencies = this.latencies.filter(l => l !== -1);
    const sum = validLatencies.reduce((a, b) => a + b, 0);
    const avg = validLatencies.length > 0 ? (sum / validLatencies.length) : 0;
    
    return {
      algorithm: this.algorithm,
      testsRun: this.latencies.length,
      failedToConverge: this.latencies.filter(l => l === -1).length, // Represents Data Loss / Failed Conflict Detection
      averageLatencyMs: avg,
      maxLatencyMs: validLatencies.length > 0 ? Math.max(...validLatencies) : 0,
      minLatencyMs: validLatencies.length > 0 ? Math.min(...validLatencies) : 0,
    };
  }

  public saveMetrics() {
    const current = fs.existsSync(this.logPath) ? JSON.parse(fs.readFileSync(this.logPath, 'utf8')) : {};
    const newData = this.getMetrics();
    // Merge array outputs if we do iterative tests
    if (current.testsRun) {
      newData.testsRun += current.testsRun;
      newData.failedToConverge += current.failedToConverge;
      newData.averageLatencyMs = (newData.averageLatencyMs + current.averageLatencyMs) / 2;
    }
    fs.writeFileSync(this.logPath, JSON.stringify(newData, null, 2));
  }
}
