import type { ProductionConfig } from './config';

export type DockerRun = (command: string[]) => Promise<string>;

export interface DockerPaths {
  root: string;
  config: string;
  env: string;
  lock: string;
  state: string;
  unit: string;
  timer: string;
}

export interface DockerContext {
  paths: DockerPaths;
  run: DockerRun;
  config: () => Promise<ProductionConfig>;
  health: (config: ProductionConfig) => Promise<void>;
  delay: (milliseconds: number) => Promise<void>;
  now: () => number;
  bun: string;
}

export interface DockerManifest {
  kind: 'docker';
  id: string;
  commit: string;
  builtAt: string;
  platform: 'linux';
  arch: 'x64';
  nodeMajor: 24;
  nodeVersion: '24.22.1';
  image: string;
  imageId: string;
  configId: string;
  imageSha256: string;
}

export interface DockerState {
  id: string;
  running: boolean;
  health: string;
  imageId: string;
}

export const dockerPaths: DockerPaths = {
  root: '/opt/new-cms/docker',
  config: '/etc/new-cms',
  env: '/etc/new-cms/docker.env',
  lock: '/run/new-cms-deploy.lock',
  state: '/var/lib/new-cms-docker/watch.json',
  unit: '/etc/systemd/system/new-cms-docker-watch.service',
  timer: '/etc/systemd/system/new-cms-docker-watch.timer',
};
