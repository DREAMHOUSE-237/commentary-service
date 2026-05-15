import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Eureka } from 'eureka-js-client';

@Injectable()
export class EurekaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EurekaService.name);
  private client: Eureka;

  onModuleInit(): void {
    const appHost    = process.env.APP_HOST       ?? 'localhost';
    const appPort    = parseInt(process.env.APP_PORT  ?? '3003', 10);
    const eurekaHost = process.env.EUREKA_HOST    ?? 'localhost';
    const eurekaPort = parseInt(process.env.EUREKA_PORT ?? '8761', 10);
    const ipAddr     = process.env.EUREKA_IP_ADDR ?? '127.0.0.1';

    this.client = new Eureka({
      instance: {
        app:        'COMMENT-SERVICE',
        hostName:   appHost,
        ipAddr:     ipAddr,
        port: {
          '$':        appPort,
          '@enabled': true,
        },
        vipAddress: 'comment-service',
        dataCenterInfo: {
          '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
          name:     'MyOwn',
        },
        statusPageUrl:  `http://${appHost}:${appPort}/info`,
        healthCheckUrl: `http://${appHost}:${appPort}/health`,
        homePageUrl:    `http://${appHost}:${appPort}/`,
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
        this.logger.log("Enregistre aupres d'Eureka avec succes");
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
