import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { RecoveryResult } from '../entities/recovery-result.entity';
import { PriceAlertEntity } from '../entities/price-alert.entity'; 
import { SmaRecord } from '../entities/sma-record.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([PriceAlertEntity, RecoveryResult,SmaRecord]) 
  ],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}