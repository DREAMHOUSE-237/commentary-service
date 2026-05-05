import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class EurekaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EurekaService.name);
  private heartbeatInterval: NodeJS.Timeout;

  private readonly eurekaUrl: string;
  private readonly appName = 'COMMENTARY-SERVICE';
  private readonly hostIp: string;
  private readonly port: number;
  private readonly instanceId: string;

  constructor(private readonly config: ConfigService) {
    this.eurekaUrl = this.config.get<string>(
      'EUREKA_URL',
      'http://localhost:8761/eureka',
    );
    this.hostIp = this.config.get<string>('HOST_IP', '127.0.0.1');
    this.port = parseInt(this.config.get<string>('APP_PORT', '8083'), 10);
    this.instanceId = `${this.hostIp}:${this.appName}:${this.port}`;
  }

  async onModuleInit() {
    await this.register();
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 25_000);
  }

  async onModuleDestroy() {
    clearInterval(this.heartbeatInterval);
    await this.deregister();
  }

  private async register() {
    const payload = {
      instance: {
        instanceId: this.instanceId,
        hostName: this.hostIp,
        app: this.appName,
        ipAddr: this.hostIp,
        status: 'UP',
        port: { $: this.port, '@enabled': 'true' },
        securePort: { $: 443, '@enabled': 'false' },
        vipAddress: this.appName.toLowerCase(),
        secureVipAddress: this.appName.toLowerCase(),
        homePageUrl: `http://${this.hostIp}:${this.port}/`,
        statusPageUrl: `http://${this.hostIp}:${this.port}/health`,
        healthCheckUrl: `http://${this.hostIp}:${this.port}/health`,
        dataCenterInfo: {
          '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
          name: 'MyOwn',
        },
        metadata: {
          'management.port': String(this.port),
          instanceId: this.instanceId,
        },
        leaseInfo: {
          renewalIntervalInSecs: 30,
          durationInSecs: 90,
        },
      },
    };

    try {
      const url = `${this.eurekaUrl}/apps/${this.appName}`;
      const res = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      });
      this.logger.log(`✅ Enregistré sur Eureka: ${this.instanceId} (${res.status})`);
    } catch (err) {
      this.logger.warn(`⚠️ Échec enregistrement Eureka: ${err.message}`);
    }
  }

  private async sendHeartbeat() {
    const url = `${this.eurekaUrl}/apps/${this.appName}/${this.instanceId}`;
    try {
      const res = await axios.put(url, null, { timeout: 5000 });
      if (res.status === 200) {
        this.logger.log(`💓 Heartbeat OK`);
      } else if (res.status === 404) {
        this.logger.warn('Instance expirée — re-enregistrement...');
        await this.register();
      }
    } catch (err) {
      this.logger.warn(`⚠️ Heartbeat échoué: ${err.message}`);
      await this.register();
    }
  }

  private async deregister() {
    const url = `${this.eurekaUrl}/apps/${this.appName}/${this.instanceId}`;
    try {
      await axios.delete(url, { timeout: 5000 });
      this.logger.log('🛑 Désenregistré d\'Eureka');
    } catch (err) {
      this.logger.warn(`⚠️ Désenregistrement échoué: ${err.message}`);
    }
  }
}