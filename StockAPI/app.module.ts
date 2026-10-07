import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
// 1. เปลี่ยนการ import เป็น PriceAlertEntity
import { PriceAlertEntity } from './price-alert.entity'; // ปรับ path ให้ตรงจุดที่เก็บไฟล์
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        ssl: false,
        entities: [PriceAlertEntity], // 2. เปลี่ยนตรงนี้
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([PriceAlertEntity]), // 3. เปลี่ยนตรงนี้
  ],
  controllers: [StockController],
  providers: [StockService],
})
export class AppModule {}