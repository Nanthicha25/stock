import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { RecoveryResult } from '../entities/recovery-result.entity';
import { PriceAlertEntity } from '../entities/price-alert.entity'; 
import { SmaRecord } from '../entities/sma-record.entity';
import { SmaModule } from '../SMA_core _calculator/src/sma/sma.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([PriceAlertEntity, RecoveryResult,SmaRecord]),
    SmaModule,
  ],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}