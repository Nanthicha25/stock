import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { StockPrice } from './stock-price.entity';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [StockPrice],
      synchronize: true,
      ssl: { rejectUnauthorized: false },
    }),
    TypeOrmModule.forFeature([StockPrice]),
  ],
  controllers: [StockController],
  providers: [StockService],
})
export class AppModule {}