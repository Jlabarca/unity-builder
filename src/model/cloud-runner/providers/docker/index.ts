import BuildParameters from '../../../build-parameters';
import CloudRunnerEnvironmentVariable from '../../services/cloud-runner-environment-variable';
import CloudRunnerLogger from '../../services/cloud-runner-logger';
import { ProviderInterface } from '../provider-interface';
import CloudRunnerSecret from '../../services/cloud-runner-secret';
import Docker from '../../../docker';
import { Action } from '../../..';
import { writeFileSync } from 'fs';
import CloudRunner from '../../cloud-runner';
import { ProviderResource } from '../provider-resource';
import { ProviderWorkflow } from '../provider-workflow';
import { CloudRunnerSystem } from '../../services/cloud-runner-system';
import fs from 'node:fs';
import { StringKeyValuePair } from '../../../shared-types';

class LocalDockerCloudRunner implements ProviderInterface {
  public buildParameters: BuildParameters | undefined;

  listResources(): Promise<ProviderResource[]> {
    return new Promise((resolve) => resolve([]));
  }
  listWorkflow(): Promise<ProviderWorkflow[]> {
    throw new Error('Method not implemented.');
  }
  watchWorkflow(): Promise<string> {
    throw new Error('Method not implemented.');
  }
  garbageCollect(
    // eslint-disable-next-line no-unused-vars
    filter: string,
    // eslint-disable-next-line no-unused-vars
    previewOnly: boolean,
    // eslint-disable-next-line no-unused-vars
    olderThan: Number,
    // eslint-disable-next-line no-unused-vars
    fullCache: boolean,
    // eslint-disable-next-line no-unused-vars
    baseDependencies: boolean,
  ): Promise<string> {
    return new Promise((result) => result(``));
  }
  async cleanupWorkflow(
    buildGuid: string,
    buildParameters: BuildParameters,
    // eslint-disable-next-line no-unused-vars
    branchName: string,
    // eslint-disable-next-line no-unused-vars
    defaultSecretsArray: { ParameterKey: string; EnvironmentVariable: string; ParameterValue: string }[],
  ) {
    const { workspace } = Action;
    if (
      fs.existsSync(
        `${workspace}/cloud-runner-cache/cache/build/build-${buildParameters.buildGuid}.tar${
          CloudRunner.buildParameters.useLz4Compression ? '.lz4' : ''
        }`,
      )
    ) {
      await CloudRunnerSystem.Run(`ls ${workspace}/cloud-runner-cache/cache/build/`);
      await CloudRunnerSystem.Run(
        `rm -r ${workspace}/cloud-runner-cache/cache/build/build-${buildParameters.buildGuid}.tar${
          CloudRunner.buildParameters.useLz4Compression ? '.lz4' : ''
        }`,
      );
    }
  }
  setupWorkflow(
    buildGuid: string,
    buildParameters: BuildParameters,
    // eslint-disable-next-line no-unused-vars
    branchName: string,
    // eslint-disable-next-line no-unused-vars
    defaultSecretsArray: { ParameterKey: string; EnvironmentVariable: string; ParameterValue: string }[],
  ) {
    this.buildParameters = buildParameters;
  }

  public async runTaskInWorkflow(
    buildGuid: string,
    image: string,
    commands: string,
    mountdir: string,
    workingdir: string,
    environment: CloudRunnerEnvironmentVariable[],
    secrets: CloudRunnerSecret[],
  ): Promise<string> {
    CloudRunnerLogger.log(buildGuid);
    CloudRunnerLogger.log(commands);

    const { workspace, actionFolder } = Action;
    const content: StringKeyValuePair[] = [];
    for (const x of secrets) {
      content.push({ name: x.EnvironmentVariable, value: x.ParameterValue });
    }
    for (const x of environment) {
      content.push({ name: x.name, value: x.value });
    }

    // if (this.buildParameters?.cloudRunnerIntegrationTests) {
    //   core.info(JSON.stringify(content, undefined, 4));
    //   core.info(JSON.stringify(secrets, undefined, 4));
    //   core.info(JSON.stringify(environment, undefined, 4));
    // }

    // eslint-disable-next-line unicorn/no-for-loop
    for (let index = 0; index < content.length; index++) {
      if (content[index] === undefined) {
        delete content[index];
      }
    }
    let myOutput = '';
    const sharedFolder = `/data/`;

    // core.info(JSON.stringify({ workspace, actionFolder, ...this.buildParameters, ...content }, undefined, 4));
    const entrypointFilePath = `start.sh`;
    const fileContents = `#!/bin/bash
set -e

mkdir -p /github/workspace/cloud-runner-cache
mkdir -p /data/cache
cp -a /github/workspace/cloud-runner-cache/. ${sharedFolder}
${commands}
cp -a ${sharedFolder}. /github/workspace/cloud-runner-cache/
`;
    writeFileSync(`${workspace}/${entrypointFilePath}`, fileContents, {
      flag: 'w',
    });

    if (CloudRunner.buildParameters.cloudRunnerDebug) {
      CloudRunnerLogger.log(`Running local-docker: \n ${fileContents}`);
    }

    if (fs.existsSync(`${workspace}/cloud-runner-cache`)) {
      await CloudRunnerSystem.Run(`ls ${workspace}/cloud-runner-cache && du -sh ${workspace}/cloud-runner-cache`);
    }
    await Docker.run(
      image,
      { workspace, actionFolder, ...this.buildParameters },
      false,
      `chmod +x /github/workspace/${entrypointFilePath} && /github/workspace/${entrypointFilePath}`,
      content,
      {
        listeners: {
          stdout: (data: Buffer) => {
            myOutput += data.toString();
          },
          stderr: (data: Buffer) => {
            myOutput += `[LOCAL-DOCKER-ERROR]${data.toString()}`;
          },
        },
      },
      true,
    );

    return myOutput;
  }
}
export default LocalDockerCloudRunner;
