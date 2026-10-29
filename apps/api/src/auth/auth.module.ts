import { Module, Global } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RecoveryService } from './recovery.service';

@Global()
@Module({ controllers: [AuthController], providers: [AuthService, RecoveryService], exports: [AuthService] })
export class AuthModule {}
