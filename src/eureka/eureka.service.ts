import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Eureka } from 'eureka-js-client';

@Injectable()
export class EurekaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EurekaService.name);
  private client: Eureka;

  onModuleInit(): void {
    const appName    = 'COMMENTARY-SERVICE';
    const appPort    = parseInt(process.env.APP_PORT      ?? '3003', 10);
    const eurekaHost = process.env.EUREKA_HOST            ?? 'localhost';
    const eurekaPort = parseInt(process.env.EUREKA_PORT   ?? '8761', 10);
    const ipAddr     = process.env.EUREKA_IP_ADDR         ?? '127.0.0.1';

    // Format instanceId identique aux autres services : IP:NOM:PORT
    const instanceId = `${ipAddr}:${appName}:${appPort}`;

    this.client = new Eureka({
      instance: {
        app:        appName,
        instanceId: instanceId,
        hostName:   ipAddr,       // IP privée, comme les autres services
        ipAddr:     ipAddr,
        port: {
          '$':        appPort,
          '@enabled': true,
        },
        vipAddress: 'commentary-service',
        dataCenterInfo: {
          '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
          name:     'MyOwn',
        },
        statusPageUrl:  `http://${ipAddr}:${appPort}/info`,
        healthCheckUrl: `http://${ipAddr}:${appPort}/health`,
        homePageUrl:    `http://${ipAddr}:${appPort}/`,
      },
      eureka: {
        host:              eurekaHost,
        port:              eurekaPort,
        servicePath:       '/eureka/apps/',
        maxRetries:        5,
        requestRetryDelay: 2000,
      },
    });

    this.client.start((error: Error) => {
      if (error) {
        this.logger.warn(`Eureka indisponible : ${error.message}`);
      } else {
        this.logger.log(`Enregistre aupres d'Eureka : ${instanceId}`);
      }
    });
  }

  onModuleDestroy(): void {
    if (this.client) {
      this.client.stop();
      this.logger.log("Desenregistre d'Eureka");
    }
  }
}