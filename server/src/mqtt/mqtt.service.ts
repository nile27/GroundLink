import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connectAsync, type MqttClient } from 'mqtt';

export type MqttMessageHandler = (topic: string, payload: Buffer) => void;

/** mqtt.js 클라이언트를 감싼 서비스. 연결·구독·발행만 담당한다. */
@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: MqttClient;
  private readonly handlers: MqttMessageHandler[] = [];

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('MQTT_URL', 'mqtt://127.0.0.1:1883');
    this.client = await connectAsync(url, {
      clientId: `gl-server-${process.pid}`,
      reconnectPeriod: 2000,
    });
    this.logger.log(`MQTT 연결됨: ${url}`);

    this.client.on('reconnect', () => this.logger.warn('MQTT 재연결 시도'));
    this.client.on('offline', () => this.logger.warn('MQTT 연결 끊김'));
    this.client.on('error', (err) => this.logger.error(`MQTT 오류: ${err.message}`));
    this.client.on('message', (topic, payload) => {
      for (const handler of this.handlers) handler(topic, payload);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.endAsync();
    this.logger.log('MQTT 연결 종료');
  }

  get connected(): boolean {
    return this.client?.connected ?? false;
  }

  /** 핸들러를 등록하고 토픽 필터를 구독한다. (재연결 시 mqtt.js가 구독을 복구함) */
  async subscribe(filters: string[], handler: MqttMessageHandler): Promise<void> {
    this.handlers.push(handler);
    await this.client.subscribeAsync(filters, { qos: 1 });
    this.logger.log(`구독: ${filters.join(', ')}`);
  }

  async publish(topic: string, payload: object, qos: 0 | 1 = 1): Promise<void> {
    await this.client.publishAsync(topic, JSON.stringify(payload), { qos });
  }
}
