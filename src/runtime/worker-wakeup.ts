export interface WorkerWakeup { enqueue(updateKey: string): Promise<void>; }

export type CloudTasksWakeupConfig = {
  readonly projectId: string;
  readonly location: string;
  readonly queue: string;
  readonly targetUrl: string;
  readonly serviceAccountEmail: string;
  readonly workerAuthToken: string;
};

export class CloudTasksWorkerWakeup implements WorkerWakeup {
  constructor(private readonly client: { readonly queuePath: (project: string, location: string, queue: string) => string; readonly createTask: (request: { readonly parent: string; readonly task: { readonly httpRequest: { readonly httpMethod: "POST"; readonly url: string; readonly headers: Record<string, string>; readonly body: string; readonly oidcToken?: { readonly serviceAccountEmail: string; readonly audience?: string } } } }) => Promise<unknown> }, private readonly config: CloudTasksWakeupConfig) {
    if (!config.workerAuthToken.trim()) throw new Error("Cloud Tasks wakeup requires worker auth token");
  }
  async enqueue(updateKey: string): Promise<void> {
    await this.client.createTask({ parent: this.client.queuePath(this.config.projectId, this.config.location, this.config.queue), task: { httpRequest: { httpMethod: "POST", url: this.config.targetUrl, headers: { "content-type": "application/json", "x-tele-auto-worker-token": this.config.workerAuthToken }, body: Buffer.from(JSON.stringify({ updateKey })).toString("base64"), oidcToken: { serviceAccountEmail: this.config.serviceAccountEmail, audience: this.config.targetUrl } } } });
  }
}
