import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {

  @Get('health')
  health() {
    return {
      status:    'UP',
      service:   'comment-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('info')
  info() {
    return {
      app:         'comment-service',
      version:     '1.0.0',
      description: 'Dreamhouse Comment Microservice',
    };
  }
}
