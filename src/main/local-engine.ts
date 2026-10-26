import { spawn, type ChildProcess } from 'child_process';
import { closeSync, openSync, readSync } from 'fs';
import net from 'net';

// The built-in engine for local AI cleanup: llama.cpp's llama-server, bound to
// 127.0.0.1 on a free port, running a GGUF model file the user picked. Started
// on first use and stopped when idle so a multi-gigabyte model does not stay in
// memory. No Electron imports, so the lifecycle is tested with a stand-in binary.

export interface EngineOptions {
  /** Stop the server after this long without a request. */
  idleMs: number;
  /** Give up if the model has not loaded by then. */
  startTimeoutMs: number;
  contextSize: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = { idleMs: 10 * 60_000, startTimeoutMs: 90_000, contextSize: 4096 };

export function llamaServerArgs(modelPath: string, port: number, contextSize: number): string[] {
  return ['-m', modelPath, '--host', '127.0.0.1', '--port', String(port), '-c', String(contextSize), '-ngl', '99'];
}

/** GGUF files start with the ASCII magic "GGUF". */
export function isGgufFile(filePath: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const header = Buffer.alloc(4);
    return readSync(fd, header, 0, 4, 0) === 4 && header.toString('ascii') === 'GGUF';
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class LocalEngine {
  private child: ChildProcess | null = null;
  private modelPath: string | null = null;
  private port = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private starting: Promise<string> | null = null;

  constructor(private readonly binaryPath: string, private readonly options: EngineOptions = DEFAULT_ENGINE_OPTIONS) {}

  get running(): boolean {
    return this.child !== null && this.child.exitCode === null;
  }

  /** Starts the server for `modelPath` if needed and returns its chat completions URL. */
  async ensure(modelPath: string): Promise<string> {
    if (this.running && this.modelPath === modelPath) {
      this.touch();
      return this.endpoint();
    }
    if (this.starting && this.modelPath === modelPath) return this.starting;
    this.stop();
    this.modelPath = modelPath;
    this.starting = this.start(modelPath).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  stop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.child && this.child.exitCode === null) this.child.kill('SIGTERM');
    this.child = null;
  }

  private endpoint(): string {
    return `http://127.0.0.1:${this.port}/v1/chat/completions`;
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.stop(), this.options.idleMs);
    this.idleTimer.unref?.();
  }

  private async start(modelPath: string): Promise<string> {
    this.port = await findFreePort();
    const child = spawn(this.binaryPath, llamaServerArgs(modelPath, this.port, this.options.contextSize), {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    this.child = child;
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString('utf8')).slice(-4000); });
    // 'close' fires after stderr is drained, so the error message is complete.
    const exited = new Promise<never>((_resolve, reject) => {
      child.once('close', (code) => reject(new Error(`The local AI engine stopped (code ${code}). ${stderr.trim().split('\n').slice(-2).join(' ')}`)));
      child.once('error', reject);
    });
    exited.catch(() => undefined);

    // /health answers 503 while the model loads and 200 once it is ready.
    const deadline = Date.now() + this.options.startTimeoutMs;
    const healthUrl = `http://127.0.0.1:${this.port}/health`;
    try {
      while (Date.now() < deadline) {
        const ready = await Promise.race([
          fetch(healthUrl, { signal: AbortSignal.timeout(2000) }).then((response) => response.ok, () => false),
          exited,
        ]);
        if (ready) {
          this.touch();
          return this.endpoint();
        }
        await wait(250);
      }
      throw new Error('The local AI model did not finish loading in time.');
    } catch (error) {
      if (this.child === child) this.stop();
      throw error;
    }
  }
}
